
import { Database as NeonDB } from '../types/database';

type PublicTables = NeonDB['public']['Tables'];
type PublicViews = NeonDB['public']['Views'];

export interface Database {
    products_with_details_core: PublicTables['products_with_details_core']['Row'];
    shops: PublicTables['shops']['Row'];
    variants: PublicTables['variants']['Row'];
    images: PublicTables['images']['Row'];
    products_enriched_data: PublicTables['products_enriched_data']['Row'];
    profiles: PublicTables['profiles']['Row'];
    size_groups: PublicTables['size_groups']['Row'];

    // Views
    distinct_size_groups: PublicViews['distinct_size_groups']['Row'];
    distinct_grouped_types: PublicViews['distinct_grouped_types']['Row'];
    distinct_top_level_categories: PublicViews['distinct_top_level_categories']['Row'];
    distinct_gender_ages: PublicViews['distinct_gender_ages']['Row'];
}

// Export aliases for compatibility and ease of use
export type ProductsWithDetailsCore = Database['products_with_details_core'];
export type Shops = Database['shops'];
export type Variants = Database['variants'];
export type Images = Database['images'];
export type ProductsEnrichedData = Database['products_enriched_data'];
export type Profiles = Database['profiles'];
export type SizeGroups = Database['size_groups'];
export type DistinctSizeGroups = Database['distinct_size_groups'];
export type DistinctGroupedTypes = Database['distinct_grouped_types'];
export type DistinctTopLevelCategories = Database['distinct_top_level_categories'];
export type DistinctGenderAges = Database['distinct_gender_ages'];
