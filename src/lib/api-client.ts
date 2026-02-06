
import { ProductWithDetails } from '../types';

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

export interface FilterOptions {
    selectedShopName: string[];
    selectedSizeGroups: string[];
    selectedGroupedTypes: string[];
    selectedTopLevelCategories: string[];
    selectedGenderAges: string[];
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
}

interface ProductPricing {
    variantPrice: number | null;
    compareAtPrice: number | null;
}

const API_BASE = '/api';

export const apiClient = {
    async fetchProducts(
        filters: FilterOptions,
        offset: number,
        sortOrder: SortOrder
    ): Promise<ProductWithDetails[]> {
        const params = new URLSearchParams();

        // Serialize filters
        if (filters.selectedShopName.length) params.append('selectedShopName', JSON.stringify(filters.selectedShopName));
        if (filters.selectedSizeGroups.length) params.append('selectedSizeGroups', JSON.stringify(filters.selectedSizeGroups));
        if (filters.selectedGroupedTypes.length) params.append('selectedGroupedTypes', JSON.stringify(filters.selectedGroupedTypes));
        if (filters.selectedTopLevelCategories.length) params.append('selectedTopLevelCategories', JSON.stringify(filters.selectedTopLevelCategories));
        if (filters.selectedGenderAges.length) params.append('selectedGenderAges', JSON.stringify(filters.selectedGenderAges));

        if (filters.onSaleOnly) params.append('onSaleOnly', 'true');
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
        return response.json();
    },

    async fetchPricing(ids: Array<number | string>): Promise<Array<{ product_id: number, price: string | number | null, compare_at_price: string | number | null }>> {
        const uniqueIds = Array.from(new Set(ids.map(id => String(id))));
        if (uniqueIds.length === 0) return [];

        const params = new URLSearchParams();
        params.append('ids', uniqueIds.join(','));

        const response = await fetch(`${API_BASE}/pricing?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch pricing: ${await response.text()}`);
        }
        return response.json();
    },

    async fetchShops() {
        const res = await fetch(`${API_BASE}/shops`);
        if (!res.ok) throw new Error('Failed to fetch shops');
        return res.json() as Promise<{ id: number, shop_name: string | null }[]>;
    },

    async fetchSizes() {
        const res = await fetch(`${API_BASE}/sizes`);
        if (!res.ok) throw new Error('Failed to fetch sizes');
        return res.json() as Promise<{ size_group: string | null }[]>;
    },

    async fetchTypes() {
        const res = await fetch(`${API_BASE}/types`);
        if (!res.ok) throw new Error('Failed to fetch types');
        return res.json() as Promise<{ grouped_product_type: string | null }[]>;
    },

    async fetchCategories() {
        const res = await fetch(`${API_BASE}/categories`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        return res.json() as Promise<{ top_level_category: string | null }[]>;
    },

    async fetchGenders() {
        const res = await fetch(`${API_BASE}/genders`);
        if (!res.ok) throw new Error('Failed to fetch genders');
        return res.json() as Promise<{ gender_age: string | null }[]>;
    }
};
