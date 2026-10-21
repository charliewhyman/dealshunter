import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db';
import { sql, Kysely } from 'kysely';
import type { Database, ProductWithShop } from '../src/lib/types';


export const app = new Hono<{
    Bindings: {
        VITE_DATABASE_URL: string;
        DATABASE_URL?: string
    },
    Variables: {
        db: Kysely<Database>;
        initDbError: string;
    }
}>();

app.use('/*', cors());

// Debug logger
app.use('*', async (c, next) => {
    console.log(`[${c.req.method}] ${c.req.path}`);
    await next();
});

// Types
type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

declare module 'hono' {
    interface ContextVariableMap {
        initDbError: string;
        db: Kysely<Database>;
    }
}

// ── Error helpers ──────────────────────────────────────────────────────────
// Centralized so every route can do `catch (error)` (which is `unknown`)
// without repeating the narrowing. `message` always exists on Error, and
// `stack` may or may not depending on the thrower (Hono, Neon, etc.).
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

// ── Connection-string cleanup ──────────────────────────────────────────────
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

// Middleware to initialize DB from Cloudflare env if available
app.use('*', async (c, next) => {
    try {
        let connectionString: string | undefined;

        if (c.env?.VITE_DATABASE_URL) {
            connectionString = c.env.VITE_DATABASE_URL;
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

// Constants
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
            has_db_url: !!c.env?.VITE_DATABASE_URL,
            init_db_error: c.get('initDbError'),
        }, 500);
    }
});

// ============================================================================
// /api/products/new-deals
// MUST be registered BEFORE /api/products/:id, otherwise Hono matches
// "new-deals" as the :id param and Postgres rejects it as a bigint.
// ============================================================================
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
            // "Latest in-window snapshot per product" as an anti-join:
            // keep `s` iff there is no strictly newer in-window snapshot
            // for the same product. Types cleanly — no scalar-subquery
            // comparison against a Date column.
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
            // bigint columns come back as strings from the Neon driver, but
            // Kysely's generated types declare them as numbers. Passing the
            // route param as-is is correct at runtime; the cast is a known
            // limitation of the Neon type generator, not a logic issue.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .where('products_with_details_core.id', '=', id as any)
            .executeTakeFirst()) as ProductWithShop | undefined;

        if (!product) {
            return c.json({ error: 'Product not found' }, 404);
        }
        return c.json(product);
    } catch (error: unknown) {
        console.error('Error fetching product:', error);
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
            // Same bigint-as-string mismatch as /api/products/:id.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
            has_db_url: !!c.env?.VITE_DATABASE_URL,
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
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
        return c.json({
            ...toErrorDetails(error),
            error: 'Internal Server Error',
        }, 500);
    }
});