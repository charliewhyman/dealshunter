// astro-app/src/data/categoryMeta.ts
export interface CategoryMeta {
  title: string;
  metaDescription: string;
  h1: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  'womens-clothing': {
    title: "Women's Clothing Canada - Compare Prices & Deals | Curated Canada",
    metaDescription: "Shop women's clothing from top Canadian retailers. Compare prices on dresses, tops, jeans, and more. Find the best deals updated daily.",
    h1: "Women's Clothing - Compare Prices Across Canada",
  },
  'mens-clothing': {
    title: "Men's Clothing Canada - Compare Prices & Deals | Curated Canada",
    metaDescription: "Browse men's clothing from leading Canadian shops. Compare prices on shirts, pants, jackets, and essentials. Save money on quality menswear.",
    h1: "Men's Clothing - Compare Prices Across Canada",
  },
  'clothing': {
    title: "Clothing Deals Canada - Shop Fashion for Everyone | Curated Canada",
    metaDescription: "Shop the best clothing deals in Canada for men, women, and everyone. Compare prices on apparel from independent retailers.",
    h1: "Clothing Deals Across Canada",
  },
  'womens-footwear': {
    title: "Women's Footwear Canada - Boots, Sneakers & Sandals | Curated Canada",
    metaDescription: "Find deals on women's shoes, boots, and sneakers from Canadian brands. Compare prices from independent Canadian shoe retailers.",
    h1: "Women's Footwear Deals",
  },
  'mens-footwear': {
    title: "Men's Footwear Canada - Boots, Sneakers & Dress Shoes | Curated Canada",
    metaDescription: "Compare prices on men's shoes, boots, and sneakers from Canadian brands. Find the best deals on footwear from independent Canadian retailers.",
    h1: "Men's Footwear Deals",
  },
  'footwear': {
    title: "Footwear Canada - Shop Shoes for Everyone | Curated Canada",
    metaDescription: "Shop all footwear deals in Canada. Sneakers, boots, and shoes for men, women, and kids from independent Canadian brands.",
    h1: "Footwear Deals Across Canada",
  },
  'jewelry': {
    title: "Jewelry Canada - Compare Prices on Necklaces, Rings & Earrings | Curated Canada",
    metaDescription: "Find the best deals on jewelry in Canada. Compare prices on necklaces, earrings, bracelets, and rings from independent Canadian retailers.",
    h1: "Jewelry - Compare Prices on Necklaces, Rings & Earrings",
  },
  'accessories': {
    title: "Accessories Canada - Bags, Hats, Scarves & More | Curated Canada",
    metaDescription: "Shop accessories from independent Canadian retailers. Compare prices on bags, hats, scarves, belts, and more. Updated daily.",
    h1: "Accessories Deals",
  },
  'home-living': {
    title: "Home & Living Canada - Decor and Lifestyle Deals | Curated Canada",
    metaDescription: "Discover unique home decor and lifestyle products from independent Canadian boutiques. Compare prices on Canadian home goods.",
    h1: "Home & Living Deals",
  },
  'made-in-canada': {
    title: "Made in Canada Products - Canadian Made Goods | Curated Canada",
    metaDescription: "Shop products made in Canada. Find clothing, footwear, accessories, and home goods produced domestically by independent Canadian brands.",
    h1: "Made in Canada Products",
  },
};