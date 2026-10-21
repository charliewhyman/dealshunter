import type { ProductWithDetails } from "../types";

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

export interface FilterOptions {
    selectedShopName: string[];
    selectedSizeGroups: string[];
    selectedGroupedTypes: string[];
    selectedTopLevelCategories: string[];
    selectedGenderAges: string[];
    onSaleOnly: boolean;
    madeInCanadaOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
}

const API_BASE = import.meta.env.PUBLIC_API_BASE ?? '/api';

export const apiClient = {
    async fetchProducts(
        filters: FilterOptions,
        offset: number,
        sortOrder: SortOrder
    ): Promise<ProductWithDetails[]> {
        const params = new URLSearchParams();

        if (filters.selectedShopName.length) params.append('selectedShopName', JSON.stringify(filters.selectedShopName));
        if (filters.selectedSizeGroups.length) params.append('selectedSizeGroups', JSON.stringify(filters.selectedSizeGroups));
        if (filters.selectedGroupedTypes.length) params.append('selectedGroupedTypes', JSON.stringify(filters.selectedGroupedTypes));
        if (filters.selectedTopLevelCategories.length) params.append('selectedTopLevelCategories', JSON.stringify(filters.selectedTopLevelCategories));
        if (filters.selectedGenderAges.length) params.append('selectedGenderAges', JSON.stringify(filters.selectedGenderAges));

        if (filters.onSaleOnly) params.append('onSaleOnly', 'true');
        if (filters.madeInCanadaOnly) params.append('madeInCanadaOnly', 'true');
        if (filters.searchQuery) params.append('searchQuery', filters.searchQuery);

        if (filters.selectedPriceRange) {
            params.append('minPrice', String(filters.selectedPriceRange[0]));
            params.append('maxPrice', String(filters.selectedPriceRange[1]));
        }

        params.append('sortOrder', sortOrder);
        params.append('offset', String(offset));

        const response = await fetch(`${API_BASE}/products?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch products: ${await response.text()}`);
        }
        const data = (await response.json()) as Array<Record<string, unknown>>;

        return data.map((p) => ({
            ...p,
            min_price:
                typeof p.min_price === 'number' || typeof p.min_price === 'string'
                    ? Number(p.min_price)
                    : null,
            max_discount_percentage:
                typeof p.max_discount_percentage === 'number' || typeof p.max_discount_percentage === 'string'
                    ? Number(p.max_discount_percentage)
                    : null,
        })) as ProductWithDetails[];
    },

    async fetchNewDealsSince(
        baselineISO: string,
        limit = 60
    ): Promise<ProductWithDetails[]> {
        const params = new URLSearchParams({
            baseline: baselineISO,
            limit: String(limit),
        });

        const response = await fetch(`${API_BASE}/products/new-deals?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch new deals: ${await response.text()}`);
        }

        const data = (await response.json()) as Array<Record<string, unknown>>;
        return data.map((p) => ({
            ...p,
            min_price:
                typeof p.min_price === 'number' || typeof p.min_price === 'string'
                    ? Number(p.min_price)
                    : null,
            max_discount_percentage:
                typeof p.max_discount_percentage === 'number' || typeof p.max_discount_percentage === 'string'
                    ? Number(p.max_discount_percentage)
                    : null,
        })) as ProductWithDetails[];
    },

    async fetchProduct(id: string | number): Promise<ProductWithDetails> {
        const response = await fetch(`${API_BASE}/products/${id}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch product: ${await response.text()}`);
        }
        const p = (await response.json()) as Record<string, unknown>;
        return {
            ...p,
            min_price:
                typeof p.min_price === 'number' || typeof p.min_price === 'string'
                    ? Number(p.min_price)
                    : null,
            max_discount_percentage:
                typeof p.max_discount_percentage === 'number' || typeof p.max_discount_percentage === 'string'
                    ? Number(p.max_discount_percentage)
                    : null,
        } as ProductWithDetails;
    },

    async fetchPricing(
        ids: Array<number | string>
    ): Promise<Array<{
        product_id: string;
        price: number | null;
        compare_at_price: number | null;
    }>> {
        const uniqueIds = Array.from(new Set(ids.map(id => String(id))));
        if (uniqueIds.length === 0) return [];

        const params = new URLSearchParams();
        params.append('ids', uniqueIds.join(','));

        const response = await fetch(`${API_BASE}/pricing?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch pricing: ${await response.text()}`);
        }

        const rows = (await response.json()) as Array<Record<string, unknown>>;
        return rows.map((row) => ({
            product_id: String(row.product_id),
            price:
                typeof row.price === 'number' || typeof row.price === 'string'
                    ? Number(row.price)
                    : null,
            compare_at_price:
                typeof row.compare_at_price === 'number' || typeof row.compare_at_price === 'string'
                    ? Number(row.compare_at_price)
                    : null,
        }));
    },

    async fetchShops(): Promise<{ id: number; shop_name: string | null }[]> {
        const res = await fetch(`${API_BASE}/shops`);
        if (!res.ok) throw new Error('Failed to fetch shops');
        return (await res.json()) as { id: number; shop_name: string | null }[];
    },

    async fetchSizes(): Promise<{ size_group: string | null }[]> {
        const res = await fetch(`${API_BASE}/sizes`);
        if (!res.ok) throw new Error('Failed to fetch sizes');
        return (await res.json()) as { size_group: string | null }[];
    },

    async fetchTypes(): Promise<{ grouped_product_type: string | null }[]> {
        const res = await fetch(`${API_BASE}/types`);
        if (!res.ok) throw new Error('Failed to fetch types');
        return (await res.json()) as { grouped_product_type: string | null }[];
    },

    async fetchCategories(): Promise<{ top_level_category: string | null }[]> {
        const res = await fetch(`${API_BASE}/categories`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        return (await res.json()) as { top_level_category: string | null }[];
    },

    async fetchGenders(): Promise<{ gender_age: string | null }[]> {
        const res = await fetch(`${API_BASE}/genders`);
        if (!res.ok) throw new Error('Failed to fetch genders');
        return (await res.json()) as { gender_age: string | null }[];
    },

    async subscribe(email: string, source: string, consentGiven: boolean): Promise<{ success: boolean; message?: string }> {
        const res = await fetch(`${API_BASE}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source, consentGiven }),
        });

        const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
        if (!res.ok) {
            throw new Error(data.error || 'Failed to subscribe');
        }
        return { success: data.success ?? true, message: data.message };
    },
};