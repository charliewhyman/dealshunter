export const COLLECTION_SLUGS = [
  // Clothing
  'clothing',
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'activewear',
  'sleepwear',
  'swimwear',
  // Footwear
  'footwear',
  'boots',
  'sandals',
  // Accessories
  'accessories',
  'jewelry',
  'headwear',
  'bags',
  'scarves-gloves',
  // Other
  'home-living',
  'made-in-canada',
] as const;

export type CollectionSlug = typeof COLLECTION_SLUGS[number];

const SLUG_LABELS: Record<string, string> = {
  'tops': 'Tops',
  'bottoms': 'Bottoms',
  'dresses': 'Dresses & Jumpsuits',
  'outerwear': 'Outerwear',
  'activewear': 'Activewear & Loungewear',
  'sleepwear': 'Sleepwear & Intimates',
  'swimwear': 'Swimwear',
  'boots': 'Boots',
  'sandals': 'Sandals & Summer',
  'jewelry': 'Jewelry',
  'headwear': 'Hats & Headwear',
  'bags': 'Bags',
  'scarves-gloves': 'Scarves & Gloves',
  'home-living': 'Home & Living',
  'made-in-canada': 'Made in Canada',
};

export const COLLECTION_FILTERS: Record<CollectionSlug, { sql: string; params: unknown[] }> = {
  'clothing': {
    sql: `top_level_category = $1`,
    params: ['Clothing'],
  },
  'tops': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Tops'],
  },
  'bottoms': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Bottoms'],
  },
  'dresses': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Dresses & Jumpsuits'],
  },
  'outerwear': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Outerwear'],
  },
  'activewear': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Activewear & Loungewear'],
  },
  'sleepwear': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Sleepwear & Intimates'],
  },
  'swimwear': {
    sql: `grouped_product_type = $1`,
    params: ['Clothing - Swimwear'],
  },
  'footwear': {
    sql: `top_level_category = $1`,
    params: ['Footwear'],
  },
  'boots': {
    sql: `grouped_product_type = $1`,
    params: ['Footwear - Boots'],
  },
  'sandals': {
    sql: `grouped_product_type = $1`,
    params: ['Footwear - Sandals & Summer'],
  },
  'accessories': {
    sql: `top_level_category = $1`,
    params: ['Accessories'],
  },
  'jewelry': {
    sql: `grouped_product_type = $1`,
    params: ['Accessories - Jewelry'],
  },
  'headwear': {
    sql: `grouped_product_type = $1`,
    params: ['Accessories - Headwear'],
  },
  'bags': {
    sql: `grouped_product_type = $1`,
    params: ['Accessories - Bags'],
  },
  'scarves-gloves': {
    sql: `grouped_product_type = $1`,
    params: ['Accessories - Scarves & Gloves'],
  },
  'home-living': {
    sql: `top_level_category = $1`,
    params: ['Home & Living'],
  },
  'made-in-canada': {
    sql: `EXISTS (SELECT 1 FROM shops s WHERE s.id = products_with_details_core.shop_id AND s.made_in_canada = true)`,
    params: [],
  },
};

export const collectionOverrides: Partial<
  Record<CollectionSlug, { title?: string; description?: string; h1?: string }>
> = {
  // Add hand-written overrides here if desired.
};

export function getCollectionMeta(slug: string) {
  const override = collectionOverrides[slug as CollectionSlug] ?? {};
  const label = SLUG_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    title: override.title ?? `${label} Deals – Canadian Brands | DealsHunter`,
    description: override.description ?? `Compare prices on ${label.toLowerCase()} from independent Canadian brands. Updated daily.`,
    h1: override.h1 ?? `${label} Deals`,
  };
}