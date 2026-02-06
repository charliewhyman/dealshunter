
import { Generated, JSONColumnType } from 'kysely';

export interface Database {
    products_with_details_core: ProductsWithDetailsCore;
    shops: Shops;
    variants: Variants;
    images: Images;
    products_enriched_data: ProductsEnrichedData;
    profiles: Profiles;
    size_groups: SizeGroups;
    distinct_size_groups: DistinctSizeGroups;
    distinct_grouped_types: DistinctGroupedTypes;
    distinct_top_level_categories: DistinctTopLevelCategories;
    distinct_gender_ages: DistinctGenderAges;
}

export interface DistinctSizeGroups {
    size_group: string | null;
}
export interface DistinctGroupedTypes {
    grouped_product_type: string | null;
}
export interface DistinctTopLevelCategories {
    top_level_category: string | null;
}
export interface DistinctGenderAges {
    gender_age: string | null;
}

export interface ProductsWithDetailsCore {
    id: Generated<string>;
    title: string | null;
    shop_id: string | null;
    shop_name: string | null;
    created_at: string | null;
    url: string | null;
    description: string | null;
    updated_at_external: string | null;
    in_stock: boolean | null;
    min_price: number | null;
    max_discount_percentage: number | null;
    on_sale: boolean | null;
    variants: JSONColumnType<any> | null;
    images: JSONColumnType<any> | null;
    fts: any | null;
    last_updated: Generated<string> | null;
    product_type: string | null;
    tags: string[] | null;
    updated_at: string | null;
    vendor: string | null;
    handle: string | null;
    published_at_external: string | null;
    last_modified: string | null;
    grouped_product_type: string | null;
    top_level_category: string | null;
    subcategory: string | null;
    gender_age: string | null;
    size_groups: string[] | null;
    gender_categories: Generated<string[]> | null;
    is_unisex: Generated<boolean> | null;
    description_format: string | null;
    shop_domain: string | null;
    is_archived: Generated<boolean> | null;
    archived_at: string | null;
    scheduled_hard_delete: string | null;
}

export interface Shops {
    id: Generated<string>;
    created_at: Generated<string>;
    url: string | null;
    category: string | null;
    shop_name: string | null;
    tags: string[] | null;
    updated_at: string | null;
    is_shopify: boolean | null;
    location: string | null;
}

export interface Variants {
    id: Generated<string>;
    product_id: string | null;
    title: string | null;
    price: number | null;
    available: boolean | null;
    compare_at_price: number | null;
    discount_percentage: number | null;
    updated_at: Generated<string> | null;
    size: string | null;
    sort_order_1: number | null;
    sort_order_2: number | null;
}

export interface Images {
    id: Generated<string>;
    product_id: string | null;
    src: string | null;
    width: number | null;
    height: number | null;
    position: number | null;
    created_at: Generated<string> | null;
    updated_at: Generated<string> | null;
    alt: string | null;
    collection_id: string | null;
    last_modified: Generated<string>;
    version: string | null;
}

export interface ProductsEnrichedData {
    product_id: string;
    size_groups: Generated<string[]> | null;
    categories: Generated<string[]> | null;
    last_enriched: Generated<string> | null;
}

export interface Profiles {
    id: string;
    email: string | null;
    phone: string | null;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
}

export interface SizeGroups {
    size_group: string;
    sort_order_1: number;
    sort_order_2: number | null;
    created_at: Generated<string> | null;
    updated_at: Generated<string> | null;
}
