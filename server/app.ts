
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db';
import { sql, Kysely } from 'kysely';
import { Database } from '../src/lib/types';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'fs/promises';

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

// Types
type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

declare module 'hono' {
    interface ContextVariableMap {
        initDbError: string;
        db: Kysely<Database>;
    }
}

// Helper to clean connection string (remove 'psql' command and quotes if present)
const cleanConnectionString = (url: string): string => {
    let cleaned = url.trim();
    // Remove 'psql' prefix if present
    if (cleaned.startsWith('psql ')) {
        cleaned = cleaned.substring(5).trim();
    }
    // Remove wrapping quotes
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
    } catch (e: any) {
        console.error('Failed to init DB:', e);
        // Redact sensitive info from error message
        const safeError = e.message
            .replace(/postgres:\/\/.*@/, 'postgres://[REDACTED]@')
            .replace(/postgresql:\/\/.*@/, 'postgresql://[REDACTED]@');
        c.set('initDbError', safeError); // Store error for debugging
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
    searchQuery?: string;
    minPrice?: number;
    maxPrice?: number;
    sortOrder?: SortOrder;
    page?: number;
    limit?: number;
}

// Constants
const ABS_MIN_PRICE = 0;
const ABS_MAX_PRICE = 500;

app.get('/api/products', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const query = c.req.query();

        // Parse query params
        const filters: FilterOptions = {
            selectedShopName: query.selectedShopName ? JSON.parse(query.selectedShopName) : [],
            selectedSizeGroups: query.selectedSizeGroups ? JSON.parse(query.selectedSizeGroups) : [],
            selectedGroupedTypes: query.selectedGroupedTypes ? JSON.parse(query.selectedGroupedTypes) : [],
            selectedTopLevelCategories: query.selectedTopLevelCategories ? JSON.parse(query.selectedTopLevelCategories) : [],
            selectedGenderAges: query.selectedGenderAges ? JSON.parse(query.selectedGenderAges) : [],
            onSaleOnly: query.onSaleOnly === 'true',
            searchQuery: query.searchQuery || '',
            minPrice: query.minPrice ? Number(query.minPrice) : undefined,
            maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
            sortOrder: (query.sortOrder as SortOrder) || 'discount_desc',
            page: query.page ? Number(query.page) : 0,
        };

        const offset = query.offset ? Number(query.offset) : 0;
        const limit = query.limit ? Number(query.limit) : 31;

        let dbQuery = db.selectFrom('products_with_details_core').selectAll();

        // Shops
        const shopIds = filters.selectedShopName?.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0) || [];
        if (shopIds.length > 0) {
            dbQuery = dbQuery.where('shop_id', 'in', shopIds);
        }

        // Size Groups
        const sizeGroups = filters.selectedSizeGroups?.filter(s => s.trim()) || [];
        if (sizeGroups.length > 0) {
            dbQuery = dbQuery.where('size_groups', '&&', sizeGroups);
        }

        // Grouped Types
        const types = filters.selectedGroupedTypes?.filter(s => s.trim()) || [];
        if (types.length > 0) {
            dbQuery = dbQuery.where('grouped_product_type', 'in', types);
        }

        // Categories
        const categories = filters.selectedTopLevelCategories?.filter(s => s.trim()) || [];
        if (categories.length > 0) {
            dbQuery = dbQuery.where('top_level_category', 'in', categories);
        }

        // Gender/Age
        const genders = filters.selectedGenderAges?.filter(s => s.trim()) || [];
        if (genders.length > 0) {
            dbQuery = dbQuery.where('gender_age', 'in', genders);
        }

        // On Sale
        if (filters.onSaleOnly) {
            dbQuery = dbQuery.where('on_sale', '=', true);
        }

        // Price Range
        if (filters.minPrice !== undefined && filters.minPrice > ABS_MIN_PRICE) {
            dbQuery = dbQuery.where('min_price', '>=', filters.minPrice);
        }
        if (filters.maxPrice !== undefined && filters.maxPrice < ABS_MAX_PRICE) {
            dbQuery = dbQuery.where('min_price', '<=', filters.maxPrice);
        }

        // Search
        if (filters.searchQuery?.trim()) {
            const search = filters.searchQuery.trim();
            dbQuery = dbQuery.where((eb) => eb('fts', '@@', sql`websearch_to_tsquery('english', ${search})`));
        }

        // Default filters
        dbQuery = dbQuery
            .where('product_type', '!=', 'Insurance')
            .where('product_type', '!=', 'Shipping')
            .where('in_stock', '=', true)
            .where('is_archived', '=', false);

        // Sort
        switch (filters.sortOrder) {
            case 'price_asc':
                dbQuery = dbQuery.orderBy('min_price', 'asc').orderBy('id', 'desc');
                break;
            case 'price_desc':
                dbQuery = dbQuery.orderBy(sql`min_price DESC NULLS LAST`).orderBy('id', 'desc');
                break;
            case 'discount_desc':
            default:
                dbQuery = dbQuery.orderBy(sql`max_discount_percentage DESC NULLS LAST`).orderBy('created_at', 'desc').orderBy('id', 'desc');
                break;
        }

        const products = await dbQuery.offset(offset).limit(limit).execute();
        return c.json(products);
    } catch (error: any) {
        console.error('Error fetching products:', error);
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack,
            env_check: c.env ? 'Env available' : 'Env missing',
            has_db_url: !!c.env?.VITE_DATABASE_URL,
            init_db_error: c.get('initDbError'),
        }, 500);
    }
});

app.get('/api/products/:id', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const id = c.req.param('id');
        const product = await db
            .selectFrom('products_with_details_core')
            .selectAll()
            .where('id', '=', Number(id))
            .executeTakeFirst();

        if (!product) {
            return c.json({ error: 'Product not found' }, 404);
        }
        return c.json(product);
    } catch (error: any) {
        console.error('Error fetching product:', error);
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
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
    } catch (error: any) {
        console.error('Error fetching pricing:', error);
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
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
            .orderBy('shop_name')
            .execute();
        return c.json(data);
    } catch (error: any) {
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack,
            // Debug info
            has_db_url: !!c.env?.VITE_DATABASE_URL
        }, 500);
    }
});

app.get('/api/sizes', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const data = await db.selectFrom('distinct_size_groups').select('size_group').execute();
        return c.json(data);
    } catch (error: any) {
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }, 500);
    }
});

app.get('/api/types', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const data = await db.selectFrom('distinct_grouped_types').select('grouped_product_type').execute();
        return c.json(data);
    } catch (error: any) {
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }, 500);
    }
});

app.get('/api/categories', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const data = await db.selectFrom('distinct_top_level_categories').select('top_level_category').execute();
        return c.json(data);
    } catch (error: any) {
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }, 500);
    }
});

app.get('/api/genders', async (c) => {
    try {
        const db = c.var.db;
        if (!db) throw new Error('Database not initialized: ' + c.var.initDbError);

        const data = await db.selectFrom('distinct_gender_ages').select('gender_age').execute();
        return c.json(data);
    } catch (error: any) {
        return c.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }, 500);
    }
});


// ... existing code ...

// Static file serving for production (dist)
// import { serveStatic } from '@hono/node-server/serve-static';  <-- Remove this
// import { readFile } from 'fs/promises';  <-- Remove this

// Serve static assets
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/vite.svg', serveStatic({ root: './dist' })); // Explicitly serve known root files if needed, or let generic handler catch them if configured correctly.
// Actually, serveStatic with root './dist' on '/*' might be better but could conflict with API?
// Best practice: 
// 1. API routes (defined above)
// 2. Specific static assets
// 3. Fallback to index.html

// Generic static file serving
app.get('/*', serveStatic({ root: './dist' }));

// SPA Fallback: Serve index.html for any unmatched non-API routes
app.get('*', async (c) => {
    try {
        const indexHtml = await readFile('./dist/index.html', 'utf-8');
        return c.html(indexHtml);
    } catch (e) {
        return c.text('Not Found', 404);
    }
});
