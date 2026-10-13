export const COLLECTION_SLUGS = [
  'womens-clothing',
  'mens-clothing',
  'clothing',
  'womens-footwear',
  'mens-footwear',
  'footwear',
  'jewelry',
  'accessories',
  'home-living',
  'made-in-canada',
] as const;

export type CollectionSlug = typeof COLLECTION_SLUGS[number];

const SLUG_LABELS: Record<string, string> = {
  'womens-clothing': "Women's Clothing",
  'mens-clothing': "Men's Clothing",
  'womens-footwear': "Women's Footwear",
  'mens-footwear': "Men's Footwear",
};

// Optional overrides — only add entries where you've written real copy.
// Anything not listed here falls back to the templated title/description/h1.
export const collectionOverrides: Partial<
  Record<CollectionSlug, { title?: string; description?: string; h1?: string }>
> = {
  // 'womens-clothing': {
  //   title: "Women's Clothing Deals from Canadian Independent Brands | DealsHunter",
  //   description: '...',
  //   h1: "Women's Clothing Deals",
  // },
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