import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db';
import { sql, Kysely } from 'kysely';
import type { Database, ProductWithShop, AlertFrequency } from '../src/lib/types';
import { verifyToken } from '@/lib/alerts/token';
import { sendAlerts, pruneSentLogs } from '@/lib/alerts/send';

export const app = new Hono<{
    Bindings: {
        vite_database_url: string;
        DATABASE_URL?: string;
        CRON_SECRET?: string;
        RESEND_API_KEY?: string;
        ALERT_FROM_EMAIL?: string;
        ALERT_TEST_RECIPIENTS?: string;
        LIVE_SEND_ENABLED?: string;
    },
    Variables: {
        db: Kysely<Database>;
        initDbError: string;
    }
}>();

app.use('/*', cors());

app.use('*', async (c, next) => {
    console.log(`[${c.req.method}] ${c.req.path}`);
    await next();
});

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

declare module 'hono' {
    interface ContextVariableMap {
        initDbError: string;
        db: Kysely<Database>;
    }
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function toErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}

const cleanConnectionString = (url: string): string => {
    let cleaned = url.trim();
    if (cleaned.startsWith('psql ')) {
        cleaned = cleaned.substring(5).trim();
    }
    if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    return cleaned;
};

app.use('*', async (c, next) => {
    try {
        let connectionString: string | undefined;
        if (c.env?.vite_database_url) {
            connectionString = c.env.vite_database_url;
        } else if (c.env?.DATABASE_URL) {
            connectionString = c.env.DATABASE_URL;
        }
        if (connectionString) {
            const cleanedUrl = cleanConnectionString(connectionString);
            const db = getDb(cleanedUrl);
            c.set('db', db);
        } else {
            console.log('No database URL found in env');
            c.set('initDbError', 'No database URL found');
        }
    } catch (error: unknown) {
        console.error('Failed to init DB:', error);
        const safeError = toErrorMessage(error)
            .replace(/postgres:\/\/.*@/, 'postgres://[REDACTED]@')
            .replace(/postgresql:\/\/.*@/, 'postgresql://[REDACTED]@');
        c.set('initDbError', safeError);
    }
    await next();
});

interface FilterOptions {
    selectedShopName?: string[];
    selectedSizeGroups?: string[];
    selectedGroupedTypes?: string[];
    selectedTopLevelCategories?: string[];
    selectedGenderAges?: string[];
    onSaleOnly?: boolean;
    madeInCanadaOnly?: boolean;
    searchQuery?: string;
    minPrice?: number;
    maxPrice?: number;
    sortOrder?: SortOrder;
    page?: number;
    limit?: number;
}

const ABS_MIN_PRICE = 0;
const ABS_MAX_PRICE = 99999;

app.get('/api/products', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const query = c.req.query();
        const filters: FilterOptions = {
            selectedShopName: query.selectedShopName ? JSON.parse(query.selectedShopName) : [],
            selectedSizeGroups: query.selectedSizeGroups ? JSON.parse(query.selectedSizeGroups) : [],
            selectedGroupedTypes: query.selectedGroupedTypes ? JSON.parse(query.selectedGroupedTypes) : [],
            selectedTopLevelCategories: query.selectedTopLevelCategories ? JSON.parse(query.selectedTopLevelCategories) : [],
            selectedGenderAges: query.selectedGenderAges ? JSON.parse(query.selectedGenderAges) : [],
            onSaleOnly: query.onSaleOnly === 'true',
            madeInCanadaOnly: query.madeInCanadaOnly === 'true',
            searchQuery: query.searchQuery || '',
            minPrice: query.minPrice ? Number(query.minPrice) : undefined,
            maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
            sortOrder: (query.sortOrder as SortOrder) || 'discount_desc',
            page: query.page ? Number(query.page) : 0,
        };
        const offset = query.offset ? Number(query.offset) : 0;
        const limit = query.limit ? Number(query.limit) : 31;
        let dbQuery = db.selectFrom('products_with_details_core')
            .leftJoin('shops', 'products_with_details_core.shop_id', 'shops.id')
            .selectAll('products_with_details_core')
            .select(sql<boolean | null>`shops.made_in_canada`.as('made_in_canada'));
        const shopIds = filters.selectedShopName?.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0) || [];
        if (shopIds.length > 0) {
            dbQuery = dbQuery.where('products_with_details_core.shop_id', 'in', shopIds);
        }
        if (filters.madeInCanadaOnly) {
            dbQuery = dbQuery.where(sql<boolean>`shops.made_in_canada`, '=', true);
        }
        const sizeGroups = filters.selectedSizeGroups?.filter(s => s.trim()) || [];
        if (sizeGroups.length > 0) {
            dbQuery = dbQuery.where(sql<boolean>`size_groups && ${sizeGroups}`);
        }
        const types = filters.selectedGroupedTypes?.filter(s => s.trim()) || [];
        if (types.length > 0) {
            dbQuery = dbQuery.where('grouped_product_type', 'in', types);
        }
        const categories = filters.selectedTopLevelCategories?.filter(s => s.trim()) || [];
        if (categories.length > 0) {
            dbQuery = dbQuery.where('top_level_category', 'in', categories);
        }
        const genders = filters.selectedGenderAges?.filter(s => s.trim()) || [];
        if (genders.length > 0) {
            dbQuery = dbQuery.where('gender_age', 'in', genders);
        }
        if (filters.onSaleOnly) {
            dbQuery = dbQuery.where('on_sale', '=', true);
        }
        if (filters.minPrice !== undefined && filters.minPrice > ABS_MIN_PRICE) {
            dbQuery = dbQuery.where('min_price', '>=', filters.minPrice);
        }
        if (filters.maxPrice !== undefined && filters.maxPrice < ABS_MAX_PRICE) {
            dbQuery = dbQuery.where('min_price', '<=', filters.maxPrice);
        }
        if (filters.searchQuery?.trim()) {
            const search = filters.searchQuery.trim();
            dbQuery = dbQuery.where((eb) => eb('fts', '@@', sql`websearch_to_tsquery('english', ${search})`));
        }
        dbQuery = dbQuery
            .where('product_type', '!=', 'Insurance')
            .where('product_type', '!=', 'Shipping')
            .where('in_stock', '=', true)
            .where('is_archived', '=', false);
        switch (filters.sortOrder) {
            case 'price_asc':
                dbQuery = dbQuery.orderBy(sql`COALESCE(min_price, 999999) ASC NULLS LAST`).orderBy('id', 'desc');
                break;
            case 'price_desc':
                dbQuery = dbQuery.orderBy(sql`COALESCE(min_price, 999999) DESC NULLS LAST`).orderBy('id', 'desc');
                break;
            case 'discount_desc':
            default:
                dbQuery = dbQuery.orderBy(sql`COALESCE(max_discount_percentage, 0) DESC NULLS LAST`).orderBy('created_at', 'desc').orderBy('id', 'desc');
                break;
        }
        const products = (await dbQuery.offset(offset).limit(limit).execute()) as ProductWithShop[];
        return c.json(products);
    } catch (error: unknown) {
        console.error('Error fetching products:', error);
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
            env_check: c.env ? 'Env available' : 'Env missing',
            has_db_url: !!c.env?.vite_database_url,
            init_db_error: c.get('initDbError'),
        }, 500);
    }
});

app.get('/api/products/new-deals', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const baseline = c.req.query('baseline');
        const limit = Math.min(Number(c.req.query('limit')) || 60, 100);
        if (!baseline) return c.json([]);
        const baselineDate = new Date(baseline);
        if (isNaN(baselineDate.getTime())) {
            return c.json({ error: 'Invalid baseline timestamp' }, 400);
        }
        const rows = (await db
            .selectFrom('product_snapshots as s')
            .innerJoin('products_with_details_core as p', 'p.id', 's.product_id')
            .leftJoin('shops', 'p.shop_id', 'shops.id')
            .selectAll('p')
            .select(sql<boolean | null>`shops.made_in_canada`.as('made_in_canada'))
            .where('s.variant_id', 'is', null)
            .where('s.taken_at', '>=', baselineDate)
            .where('s.on_sale', '=', true)
            .where((eb) =>
                eb.not(
                    eb.exists(
                        eb.selectFrom('product_snapshots as s2')
                            .select('s2.id')
                            .whereRef('s2.product_id', '=', 's.product_id')
                            .where('s2.variant_id', 'is', null)
                            .where('s2.taken_at', '>=', baselineDate)
                            .whereRef('s2.taken_at', '>', 's.taken_at')
                    )
                )
            )
            .where('p.in_stock', '=', true)
            .where('p.is_archived', '=', false)
            .where('p.product_type', '!=', 'Insurance')
            .where('p.product_type', '!=', 'Shipping')
            .orderBy(sql`COALESCE(s.max_discount_percentage, 0) DESC NULLS LAST`)
            .orderBy('p.id', 'desc')
            .limit(limit)
            .execute()) as ProductWithShop[];
        return c.json(rows);
    } catch (error: unknown) {
        console.error('Error fetching new deals:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/products/:id', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const id = c.req.param('id');
        const product = (await db
            .selectFrom('products_with_details_core')
            .leftJoin('shops', 'products_with_details_core.shop_id', 'shops.id')
            .selectAll('products_with_details_core')
            .select(sql<boolean | null>`shops.made_in_canada`.as('made_in_canada'))
            .where('products_with_details_core.id', '=', id as any)
            .executeTakeFirst()) as ProductWithShop | undefined;
        if (!product) {
            return c.json({ error: 'Product not found' }, 404);
        }
        return c.json(product);
    } catch (error: unknown) {
        console.error('Error fetching product:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/out/:id', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const productIdStr = c.req.param('id');
        const source = c.req.query('src') || null;
        const product = await db.selectFrom('products_with_details_core')
            .select(['url', 'id'])
            .where('id', '=', productIdStr as any)
            .executeTakeFirst();
        if (!product || !product.url) {
            return c.redirect('/404', 302);
        }
        const ip = c.req.header('cf-connecting-ip')
            || c.req.header('x-real-ip')
            || c.req.header('x-forwarded-for')?.split(',')[0].trim()
            || '';
        await db.insertInto('product_clicks')
        .values({
            product_id: productIdStr as unknown as number,
            ip_address: ip.substring(0, 255),
            user_agent: c.req.header('user-agent') || null,
            referrer: c.req.header('referer') || null,
            country: c.req.header('cf-ipcountry') || null,
            source,
        })
        .execute();
        return c.redirect(product.url, 302);
    } catch (error: unknown) {
        console.error('Error handling outbound click:', error);
        return c.redirect('/', 302);
    }
});

app.post('/api/subscribe', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const body = await c.req.json();
        const { email, source, consentGiven } = body;
        if (!email || !email.includes('@')) {
            return c.json({ error: 'Valid email is required' }, 400);
        }
        if (!consentGiven) {
            return c.json({ error: 'Consent is required to subscribe' }, 400);
        }
        const ip = c.req.header('cf-connecting-ip')
            || c.req.header('x-real-ip')
            || c.req.header('x-forwarded-for')?.split(',')[0].trim()
            || null;
        await db.insertInto('subscribers')
            .values({
                email: email.trim().toLowerCase(),
                ip_address: ip,
                source: source || 'unknown',
                consent_given: true,
            })
            .onConflict((oc) => oc.column('email').doNothing())
            .execute();
        return c.json({ success: true, message: 'Subscribed successfully' });
    } catch (error: unknown) {
        console.error('Error handling subscription:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.post('/api/alerts/unsubscribe', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    let body: { token?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'invalid body' }, 400);
    }
    const payload = body.token ? verifyToken(body.token) : null;
    if (!payload || (payload.purpose !== 'unsubscribe' && payload.purpose !== 'manage')) {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    await db
      .updateTable('subscribers')
      .set({ consent_given: false })
      .where('id', '=', payload.subscriberId)
      .execute();
    await db
      .updateTable('alert_rules')
      .set({
        rules: JSON.stringify([]),
        watches: JSON.stringify([]),
        updated_at: new Date(),
      })
      .where('subscriber_id', '=', payload.subscriberId)
      .execute();
    return c.json({ ok: true });
  } catch (error: unknown) {
    console.error('Error handling unsubscribe:', error);
    return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
  }
});

// ── Manage alerts: read state ─────────────────────────────────────────────
app.get('/api/alerts/state', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    const token = c.req.query('token') ?? '';
    const payload = verifyToken(token);
    if (!payload || payload.purpose !== 'manage') {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    const subscriber = await db
      .selectFrom('subscribers')
      .select(['id', 'email', 'consent_given'])
      .where('id', '=', payload.subscriberId)
      .executeTakeFirst();
    if (!subscriber) {
      return c.json({ ok: false, error: 'subscriber not found' }, 404);
    }
    const ar = await db
      .selectFrom('alert_rules')
      .select(['rules', 'watches'])
      .where('subscriber_id', '=', payload.subscriberId)
      .executeTakeFirst();
    const parseJsonb = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return []; }
      }
      return [];
    };
    return c.json({
      ok: true,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        consent_given: subscriber.consent_given ?? false,
      },
      rules: parseJsonb(ar?.rules),
      watches: parseJsonb(ar?.watches),
    });
  } catch (error: unknown) {
    console.error('Error fetching alerts state:', error);
    return c.json({ ...toErrorDetails(error), ok: false, error: 'Internal Server Error' }, 500);
  }
});

// ── Manage alerts: create or update a rule ────────────────────────────────
app.post('/api/alerts/rules', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    const body = await c.req.json();
    const { token, rule } = body as { token?: string; rule?: unknown };
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.purpose !== 'manage') {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      return c.json({ ok: false, error: 'invalid rule' }, 400);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) {
      return c.json({ ok: false, error: 'rule.id required' }, 400);
    }
    const normalized = {
      id: r.id,
      categories: Array.isArray(r.categories) ? r.categories.filter((x): x is string => typeof x === 'string') : [],
      types: Array.isArray(r.types) ? r.types.filter((x): x is string => typeof x === 'string') : [],
      genders: Array.isArray(r.genders) ? r.genders.filter((x): x is string => typeof x === 'string') : [],
      sizes: Array.isArray(r.sizes) ? r.sizes.filter((x): x is string => typeof x === 'string') : [],
      shop_ids: Array.isArray(r.shop_ids) ? r.shop_ids.filter((x): x is string => typeof x === 'string') : [],
      made_in_canada_only: typeof r.made_in_canada_only === 'boolean' ? r.made_in_canada_only : false,
      max_price: typeof r.max_price === 'number' ? r.max_price : null,
      min_discount: typeof r.min_discount === 'number' ? r.min_discount : 20,
      frequency: r.frequency === 'instant' || r.frequency === 'daily' || r.frequency === 'weekly'
        ? r.frequency
        : 'weekly',
    };
    const existing = await db
      .selectFrom('alert_rules')
      .select(['rules'])
      .where('subscriber_id', '=', payload.subscriberId)
      .executeTakeFirst();
    const parseJsonb = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const current = parseJsonb(existing?.rules) as Array<Record<string, unknown>>;
    const idx = current.findIndex(x => x.id === normalized.id);
    if (idx >= 0) current[idx] = normalized;
    else current.push(normalized);
    if (current.length > 10) {
      return c.json({ ok: false, error: 'maximum 10 rules per subscriber' }, 400);
    }
    if (existing) {
      await db
        .updateTable('alert_rules')
        .set({ rules: JSON.stringify(current), updated_at: new Date() })
        .where('subscriber_id', '=', payload.subscriberId)
        .execute();
    } else {
      await db
        .insertInto('alert_rules')
        .values({
          subscriber_id: payload.subscriberId,
          rules: JSON.stringify(current),
          watches: JSON.stringify([]),
          sent_log: JSON.stringify([]),
        })
        .execute();
    }
    return c.json({ ok: true, rules: current });
  } catch (error: unknown) {
    console.error('Error saving rule:', error);
    return c.json({ ...toErrorDetails(error), ok: false, error: 'Internal Server Error' }, 500);
  }
});

// ── Manage alerts: delete a rule ──────────────────────────────────────────
app.delete('/api/alerts/rules/:id', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    const token = c.req.query('token') ?? '';
    const payload = verifyToken(token);
    if (!payload || payload.purpose !== 'manage') {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    const ruleId = c.req.param('id');
    const existing = await db
      .selectFrom('alert_rules')
      .select(['rules'])
      .where('subscriber_id', '=', payload.subscriberId)
      .executeTakeFirst();
    if (!existing) return c.json({ ok: true, rules: [] });
    const parseJsonb = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const current = (parseJsonb(existing.rules) as Array<Record<string, unknown>>)
      .filter(x => x.id !== ruleId);
    await db
      .updateTable('alert_rules')
      .set({ rules: JSON.stringify(current), updated_at: new Date() })
      .where('subscriber_id', '=', payload.subscriberId)
      .execute();
    return c.json({ ok: true, rules: current });
  } catch (error: unknown) {
    console.error('Error deleting rule:', error);
    return c.json({ ...toErrorDetails(error), ok: false, error: 'Internal Server Error' }, 500);
  }
});

// ── Manage alerts: add a product watch ────────────────────────────────────
app.post('/api/alerts/watches', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    const body = await c.req.json();
    const { token, productId, targetPrice } = body as {
      token?: string;
      productId?: string;
      targetPrice?: number | null;
    };
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.purpose !== 'manage') {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    if (!productId || !/^\d+$/.test(productId)) {
      return c.json({ ok: false, error: 'valid productId required' }, 400);
    }
    const existing = await db
      .selectFrom('alert_rules')
      .select(['watches'])
      .where('subscriber_id', '=', payload.subscriberId)
      .executeTakeFirst();
    const parseJsonb = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const current = parseJsonb(existing?.watches) as Array<Record<string, unknown>>;
    if (current.some(w => w.product_id === productId)) {
      return c.json({ ok: false, error: 'already watching this product' }, 400);
    }
    if (current.length >= 20) {
      return c.json({ ok: false, error: 'maximum 20 watches per subscriber' }, 400);
    }
    const newWatch = {
      id: `w${Date.now()}`,
      product_id: productId,
      target_price: typeof targetPrice === 'number' ? targetPrice : null,
      frequency: 'weekly',
    };
    current.push(newWatch);
    if (existing) {
      await db
        .updateTable('alert_rules')
        .set({ watches: JSON.stringify(current), updated_at: new Date() })
        .where('subscriber_id', '=', payload.subscriberId)
        .execute();
    } else {
      await db
        .insertInto('alert_rules')
        .values({
          subscriber_id: payload.subscriberId,
          rules: JSON.stringify([]),
          watches: JSON.stringify(current),
          sent_log: JSON.stringify([]),
        })
        .execute();
    }
    return c.json({ ok: true, watches: current });
  } catch (error: unknown) {
    console.error('Error adding watch:', error);
    return c.json({ ...toErrorDetails(error), ok: false, error: 'Internal Server Error' }, 500);
  }
});

// ── Manage alerts: delete a watch ─────────────────────────────────────────
app.delete('/api/alerts/watches/:id', async (c) => {
  try {
    const db = c.var.db;
    if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
    const token = c.req.query('token') ?? '';
    const payload = verifyToken(token);
    if (!payload || payload.purpose !== 'manage') {
      return c.json({ ok: false, error: 'invalid token' }, 400);
    }
    const watchId = c.req.param('id');
    const existing = await db
      .selectFrom('alert_rules')
      .select(['watches'])
      .where('subscriber_id', '=', payload.subscriberId)
      .executeTakeFirst();
    if (!existing) return c.json({ ok: true, watches: [] });
    const parseJsonb = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const current = (parseJsonb(existing.watches) as Array<Record<string, unknown>>)
      .filter(w => w.id !== watchId);
    await db
      .updateTable('alert_rules')
      .set({ watches: JSON.stringify(current), updated_at: new Date() })
      .where('subscriber_id', '=', payload.subscriberId)
      .execute();
    return c.json({ ok: true, watches: current });
  } catch (error: unknown) {
    console.error('Error deleting watch:', error);
    return c.json({ ...toErrorDetails(error), ok: false, error: 'Internal Server Error' }, 500);
  }
});

app.get('/api/pricing', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const ids = c.req.query('ids');
        if (!ids) return c.json([]);
        const idList = ids.split(',').map(id => Number(id)).filter(n => !isNaN(n));
        if (idList.length === 0) return c.json([]);
        const prices = await db
            .selectFrom('variants')
            .select(['product_id', 'price', 'compare_at_price'])
            .where('product_id', 'in', idList)
            .execute();
        return c.json(prices);
    } catch (error: unknown) {
        console.error('Error fetching pricing:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/shops', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const data = await db
            .selectFrom('shops')
            .select(['id', 'shop_name'])
            .where((eb) =>
                eb(
                    eb.selectFrom('products_with_details_core')
                        .select(eb.fn.countAll().as('count'))
                        .whereRef('shop_id', '=', 'shops.id')
                        .where('in_stock', '=', true)
                        .where('is_archived', '=', false)
                        .where('product_type', '!=', 'Insurance')
                        .where('product_type', '!=', 'Shipping'),
                    '>=',
                    2
                )
            )
            .orderBy('shop_name')
            .execute();
        return c.json(data);
    } catch (error: unknown) {
        console.error('Error fetching shops:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error', has_db_url: !!c.env?.vite_database_url }, 500);
    }
});

app.get('/api/sizes', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const data = await db
            .selectFrom('distinct_size_groups')
            .select(['size_group', 'sort_order_1'])
            .orderBy('sort_order_1', 'asc')
            .execute();
        return c.json(data);
    } catch (error: unknown) {
        console.error('Error fetching sizes:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/types', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const data = await db.selectFrom('distinct_grouped_types').select('grouped_product_type').execute();
        return c.json(data);
    } catch (error: unknown) {
        console.error('Error fetching types:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/categories', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const data = await db.selectFrom('distinct_top_level_categories').select('top_level_category').execute();
        return c.json(data);
    } catch (error: unknown) {
        console.error('Error fetching categories:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/genders', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);
        const data = await db.selectFrom('distinct_gender_ages').select('gender_age').execute();
        return c.json(data);
    } catch (error: unknown) {
        console.error('Error fetching genders:', error);
        return c.json({ ...toErrorDetails(error), error: 'Internal Server Error' }, 500);
    }
});

// ── Cron: send alerts ──────────────────────────────────────────────────────
app.get('/api/cron/send-alerts', async (c) => {
  const secret = c.env?.CRON_SECRET;
  const provided = c.req.header('x-cron-secret');
  if (!secret || provided !== secret) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  const freq = c.req.query('frequency');
  const frequency: AlertFrequency | undefined =
    freq === 'instant' || freq === 'daily' || freq === 'weekly'
      ? freq
      : undefined;
  const dryRun = c.req.query('dry') === '1';
  const testMode = c.req.query('test') === '1';
  const limit = Math.min(Number(c.req.query('limit')) || 100, 100);

  let emailAllowlist: string[] | undefined;
  if (testMode) {
    emailAllowlist = ['charliewhyman@proton.me'];
  } else if (c.env?.ALERT_TEST_RECIPIENTS) {
    emailAllowlist = c.env.ALERT_TEST_RECIPIENTS
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }

  const liveSend = c.env?.LIVE_SEND_ENABLED === 'true';
  const effectiveDryRun = dryRun || (!liveSend && !testMode);

  try {
    const report = await sendAlerts({
      frequency,
      dryRun: effectiveDryRun,
      limit,
      emailAllowlist,
      resendApiKey: c.env?.RESEND_API_KEY,
      fromEmail: c.env?.ALERT_FROM_EMAIL,
      subscriberId: testMode ? 50 : undefined,
    });

    const pruned = frequency === 'daily' && !effectiveDryRun ? await pruneSentLogs(30) : 0;

    return c.json({
      ok: true,
      frequency: frequency ?? 'all',
      dry_run: effectiveDryRun,
      live_send_enabled: liveSend,
      allowlist_active: !!emailAllowlist && emailAllowlist.length > 0,
      allowlist_size: emailAllowlist?.length ?? 0,
      sent: report.results.filter(r => r.status === 'sent').length,
      skipped: report.results.filter(r => r.status === 'dry-run' || r.status === 'skipped').length,
      errors: report.results.filter(r => r.status === 'error').length,
      rate_limited: report.rateLimited,
      pruned_subscribers: pruned,
      results: report.results,
    });
  } catch (err) {
    console.error('[cron] sendAlerts threw:', err);
    return c.json({ ok: false, error: (err as Error).message }, 500);
  }
});