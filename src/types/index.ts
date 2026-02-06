interface VariantDetail {
  id: number;
  title: string;
  price: number;
  discount_percentage: number;
  available: boolean;
}

interface ImageDetail {
  id: number;
  src: string;
  alt?: string;
  position?: number;
}

export interface ProductWithDetails {
  id: number;
  title: string;
  shop_id: number | null;
  shop_name: string;
  created_at: string;
  url: string;
  description?: string;
  updated_at_external?: string;
  in_stock: boolean;
  min_price?: number;
  max_discount_percentage?: number;
  on_sale: boolean;
  size_groups?: string[];
  variants?: VariantDetail[];
  images?: ImageDetail[];
  grouped_product_type?: string | null;
  vendor?: string | null;
  tags: string[] | null;
}

export interface ProductVariant {
  id: number;
  is_price_lower: boolean;
}

export interface ProductOffer {
  id: number;
  availability: string;
  price: number;
}

export interface Product {
  id: number;
  title: string;
  description: string;
  shop_id: string;
  shop_name?: string | null;
  created_at: string;
  url: string;
  updated_at_external: string | null;
  min_price: number;
  in_stock: boolean;
  max_discount_percentage: number | null;
  on_sale: boolean;
  variants?: ProductVariant[];
  offers?: ProductOffer[];
}


