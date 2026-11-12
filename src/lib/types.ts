import type { Database as NeonDB } from '../types/database';
import type { Generated } from 'kysely';

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
    product_clicks: Omit<PublicTables['product_clicks']['Row'], 'id' | 'clicked_at'> & {
        id: Generated<number>;               // serial
        clicked_at: Generated<Date | null>;  // DEFAULT CURRENT_TIMESTAMP
    };
    subscribers: {
        id: Generated<number>;
        email: string;
        ip_address: string | null;
        source: string | null;
        consent_given: boolean | null;
        created_at: Generated<Date | null>;
    };
    alert_rules: {
    subscriber_id: number;
    rules: string;                  // jsonb stored/read as string
    watches: string;
    sent_log: string;
    updated_at: Generated<Date>;
};

    // NEW: created by the scraper's snapshot logic; not in Neon's
    // generated types, so declared inline like `subscribers`.
    product_snapshots: {
        id: Generated<string>;                     // bigserial
        product_id: string;                        // bigint
        variant_id: string | null;                 // bigint | null
        min_price: string | null;                  // numeric → string
        max_discount_percentage: string | null;    // numeric → string
        on_sale: boolean;
        in_stock: boolean;
        taken_at: Generated<Date>;                 // timestamptz DEFAULT now()
    };

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
export type ProductClicks = Database['product_clicks'];
export type ProductSnapshots = Database['product_snapshots'];
export type DistinctSizeGroups = Database['distinct_size_groups'];
export type DistinctGroupedTypes = Database['distinct_grouped_types'];
export type DistinctTopLevelCategories = Database['distinct_top_level_categories'];
export type DistinctGenderAges = Database['distinct_gender_ages'];
export type AlertRules = Database['alert_rules'];

// A product row joined with its shop's `made_in_canada` flag.
// Returned by /api/products, /api/products/:id, and /api/products/new-deals.
export interface ProductWithShop extends ProductsWithDetailsCore {
    made_in_canada: boolean | null;
}

// ============================================================================
// ALERTS
// ============================================================================

export type AlertFrequency = 'instant' | 'daily' | 'weekly';

export type RuleMatch = {
  subscriber_id: number;
  email: string;
  rule_id: string;
  frequency: AlertFrequency;
  product_id: bigint;
  title: string;
  shop_name: string | null;
  min_price: number;
  max_discount_percentage: number;
  image_url: string | null;
  product_url: string | null;
  is_first_send: boolean;
  size_groups: string[] | null;
  rule_json: {
    id: string;
    categories?: string[];
    types?: string[];
    genders?: string[];
    sizes?: string[];
    shop_ids?: string[];
    min_discount?: number;
    max_price?: number | null;
    made_in_canada_only?: boolean;
    frequency?: AlertFrequency;
  };
};

export type WatchMatch = {
  subscriber_id: number;
  email: string;
  watch_id: string;
  frequency: AlertFrequency;
  product_id: bigint;
  title: string;
  shop_name: string | null;
  min_price: number;
  max_discount_percentage: number;
  image_url: string | null;
  product_url: string | null;
  size_groups: string[] | null;
  is_first_send: boolean;
};

export type TokenPayload = {
  subscriberId: number;
  purpose: 'unsubscribe' | 'manage';
  exp: number;
};