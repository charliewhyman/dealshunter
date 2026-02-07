
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from './db';
import { sql } from 'kysely';

const app = new Hono();

app.use('/*', cors());

// Types
type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

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
            page: query.page ? Number(query.page) : 0, // page is actually offset in frontend logic? No, frontend passes offset directly.
            // Wait, frontend passes offset. Let's use offset.
        };

        // Check if frontend sends 'offset' or 'page'
        const offset = query.offset ? Number(query.offset) : 0;
        const limit = query.limit ? Number(query.limit) : 31; // Default to 30 + 1 for hasMore check

        let dbQuery = db.selectFrom('products_with_details_core').selectAll();

        // Shops
        // Frontend passes shop names (IDs as strings)
        const shopIds = filters.selectedShopName?.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0) || [];
        if (shopIds.length > 0) {
            dbQuery = dbQuery.where('shop_id', 'in', shopIds);
        }

        // Size Groups
        const sizeGroups = filters.selectedSizeGroups?.filter(s => s.trim()) || [];
        if (sizeGroups.length > 0) {
            // Kysely array operator '&&' for overlaps
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
            // websearch_to_tsquery
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
                // Use sql for NULLS LAST if needed, but min_price is usually not null on active products.
                // However, let's keep it consistent.
                dbQuery = dbQuery.orderBy(sql`min_price DESC NULLS LAST`).orderBy('id', 'desc');
                break;
            case 'discount_desc':
            default:
                dbQuery = dbQuery.orderBy(sql`max_discount_percentage DESC NULLS LAST`).orderBy('created_at', 'desc').orderBy('id', 'desc');
                break;
        }

        const products = await dbQuery.offset(offset).limit(limit).execute();
        return c.json(products);

    } catch (error) {
        console.error('Error fetching products:', error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/products/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const product = await db
            .selectFrom('products_with_details_core')
            .selectAll()
            .where('id', '=', Number(id)) // Assuming id is number in DB based on previous usage, but params are strings. Let's check types.
            // product_with_details_core id is likely integer.
            .executeTakeFirst();

        if (!product) {
            return c.json({ error: 'Product not found' }, 404);
        }
        return c.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/pricing', async (c) => {
    try {
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
    } catch (error) {
        console.error('Error fetching pricing:', error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/shops', async (c) => {
    try {
        const data = await db
            .selectFrom('shops')
            .select(['id', 'shop_name'])
            .orderBy('shop_name')
            .execute();
        return c.json(data);
    } catch (error) {
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/sizes', async (c) => {
    try {
        const data = await db.selectFrom('distinct_size_groups').select('size_group').execute();
        return c.json(data);
    } catch (error) {
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/types', async (c) => {
    try {
        const data = await db.selectFrom('distinct_grouped_types').select('grouped_product_type').execute();
        return c.json(data);
    } catch (error) {
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/categories', async (c) => {
    try {
        const data = await db.selectFrom('distinct_top_level_categories').select('top_level_category').execute();
        return c.json(data);
    } catch (error) {
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

app.get('/api/genders', async (c) => {
    try {
        const data = await db.selectFrom('distinct_gender_ages').select('gender_age').execute();
        return c.json(data);
    } catch (error) {
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
