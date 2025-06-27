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
  shop_id: string;
  shop_name: string;
  created_at: string;
  url: string;
  description?: string;
  updated_at_external?: string;
  in_stock: boolean;
  min_price?: number;
  max_discount_percentage?: number;
  on_sale: boolean;
  variants?: VariantDetail[];
  images?: ImageDetail[];
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

// Supabase view response type
export interface ProductFromView {
  id: string;
  title: string;
  shop_id: string;
  shop_name: string;
  created_at: string;
  url: string;
  description: string;
  updated_at_external: string;
  in_stock: boolean;
  min_price: number;
  max_discount_percentage: number | null;
  on_sale: boolean;
}

// Helper function to convert view response to Product
export function toProduct(viewProduct: ProductFromView): Product {
  return {
    ...viewProduct,
    id: parseInt(viewProduct.id),
    variants: [],
    offers: []
  };
}


// Supabase types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      collections: {
        Row: {
          collection_group_id: number | null
          collection_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          handle: string | null
          id: number
          products_count: number | null
          published_at_external: string | null
          shop_id: number | null
          submitted_by: string
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
        }
        Insert: {
          collection_group_id?: number | null
          collection_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id?: number
          products_count?: number | null
          published_at_external?: string | null
          shop_id?: number | null
          submitted_by: string
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Update: {
          collection_group_id?: number | null
          collection_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id?: number
          products_count?: number | null
          published_at_external?: string | null
          shop_id?: number | null
          submitted_by?: string
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          comment_text: string | null
          created_at: string
          deleted_at: string | null
          flagged_status: number | null
          id: string
          product_id: number
          reply_of: string | null
          user_id: string
        }
        Insert: {
          comment_text?: string | null
          created_at?: string
          deleted_at?: string | null
          flagged_status?: number | null
          id?: string
          product_id: number
          reply_of?: string | null
          user_id: string
        }
        Update: {
          comment_text?: string | null
          created_at?: string
          deleted_at?: string | null
          flagged_status?: number | null
          id?: string
          product_id?: number
          reply_of?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_of_fkey"
            columns: ["reply_of"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          alt: string | null
          collection_id: number | null
          created_at: string | null
          created_at_external: string | null
          height: number | null
          id: number
          last_modified: string
          last_updated: string | null
          position: number | null
          product_id: number | null
          src: string | null
          updated_at: string | null
          updated_at_external: string | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          collection_id?: number | null
          created_at?: string | null
          created_at_external?: string | null
          height?: number | null
          id: number
          last_modified?: string
          last_updated?: string | null
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          collection_id?: number | null
          created_at?: string | null
          created_at_external?: string | null
          height?: number | null
          id?: number
          last_modified?: string
          last_updated?: string | null
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          availability: string | null
          checkout_page_url_template: string | null
          id: string
          image: string | null
          item_condition: string | null
          last_modified: string
          last_updated: string | null
          mpn: string | null
          price: number | null
          price_currency: string | null
          price_valid_until: string | null
          product_id: number | null
          seller_name: string | null
          sku: string | null
          url: string | null
        }
        Insert: {
          availability?: string | null
          checkout_page_url_template?: string | null
          id: string
          image?: string | null
          item_condition?: string | null
          last_modified?: string
          last_updated?: string | null
          mpn?: string | null
          price?: number | null
          price_currency?: string | null
          price_valid_until?: string | null
          product_id?: number | null
          seller_name?: string | null
          sku?: string | null
          url?: string | null
        }
        Update: {
          availability?: string | null
          checkout_page_url_template?: string | null
          id?: string
          image?: string | null
          item_condition?: string | null
          last_modified?: string
          last_updated?: string | null
          mpn?: string | null
          price?: number | null
          price_currency?: string | null
          price_valid_until?: string | null
          product_id?: number | null
          seller_name?: string | null
          sku?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          id: string
          name: string | null
          position: number | null
          product_id: number | null
          values: string[] | null
        }
        Insert: {
          id: string
          name?: string | null
          position?: number | null
          product_id?: number | null
          values?: string[] | null
        }
        Update: {
          id?: string
          name?: string | null
          position?: number | null
          product_id?: number | null
          values?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: number
          date_updated: string | null
          id: number
          product_id: number
        }
        Insert: {
          collection_id: number
          date_updated?: string | null
          id?: number
          product_id: number
        }
        Update: {
          collection_id?: number
          date_updated?: string | null
          id?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          id: number
          product_id: number | null
          tag: string | null
        }
        Insert: {
          id?: number
          product_id?: number | null
          tag?: string | null
        }
        Update: {
          id?: number
          product_id?: number | null
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          created_at_external: string | null
          deleted_at: string | null
          description: string | null
          fts: unknown | null
          handle: string | null
          id: number
          last_modified: string
          last_updated: string | null
          product_type: string | null
          published_at_external: string | null
          shop_id: number | null
          submitted_by: string
          tags: string[] | null
          title: string | null
          title_search: unknown | null
          updated_at: string | null
          updated_at_external: string | null
          url: string | null
          vendor: string | null
          votes: number | null
        }
        Insert: {
          created_at?: string | null
          created_at_external?: string | null
          deleted_at?: string | null
          description?: string | null
          fts?: unknown | null
          handle?: string | null
          id: number
          last_modified?: string
          last_updated?: string | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id?: number | null
          submitted_by: string
          tags?: string[] | null
          title?: string | null
          title_search?: unknown | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
          votes?: number | null
        }
        Update: {
          created_at?: string | null
          created_at_external?: string | null
          deleted_at?: string | null
          description?: string | null
          fts?: unknown | null
          handle?: string | null
          id?: number
          last_modified?: string
          last_updated?: string | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id?: number | null
          submitted_by?: string
          tags?: string[] | null
          title?: string | null
          title_search?: unknown | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
          votes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products_with_details: {
        Row: {
          created_at: string | null
          description: string | null
          fts: unknown | null
          has_clothing: boolean | null
          has_footwear: boolean | null
          id: number
          images: Json[] | null
          in_stock: boolean | null
          last_updated: string | null
          max_discount_percentage: number | null
          min_price: number | null
          on_sale: boolean | null
          shop_id: number | null
          shop_name: string | null
          size_groups: string[] | null
          size_types: string[] | null
          title: string | null
          updated_at_external: string | null
          url: string | null
          variants: Json[] | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fts?: unknown | null
          has_clothing?: boolean | null
          has_footwear?: boolean | null
          id: number
          images?: Json[] | null
          in_stock?: boolean | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          shop_id?: number | null
          shop_name?: string | null
          size_groups?: string[] | null
          size_types?: string[] | null
          title?: string | null
          updated_at_external?: string | null
          url?: string | null
          variants?: Json[] | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fts?: unknown | null
          has_clothing?: boolean | null
          has_footwear?: boolean | null
          id?: number
          images?: Json[] | null
          in_stock?: boolean | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          shop_id?: number | null
          shop_name?: string | null
          size_groups?: string[] | null
          size_types?: string[] | null
          title?: string | null
          updated_at_external?: string | null
          url?: string | null
          variants?: Json[] | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          username: string | null
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          username?: string | null
        }
        Update: {
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          username?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          product_id: number | null
          report_count: number
          reported_by: string | null
          reported_user: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          product_id?: number | null
          report_count?: number
          reported_by?: string | null
          reported_user?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          product_id?: number | null
          report_count?: number
          reported_by?: string | null
          reported_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_fkey"
            columns: ["reported_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          category: string | null
          created_at: string
          id: number
          location: string | null
          returns: string | null
          shipping: string | null
          shop_name: string | null
          tags: string[] | null
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: number
          location?: string | null
          returns?: string | null
          shipping?: string | null
          shop_name?: string | null
          tags?: string[] | null
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: number
          location?: string | null
          returns?: string | null
          shipping?: string | null
          shop_name?: string | null
          tags?: string[] | null
          url?: string | null
        }
        Relationships: []
      }
      size_groups: {
        Row: {
          created_at: string
          id: number
          size: string | null
          size_group: string | null
          size_group_order: number | null
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          size?: string | null
          size_group?: string | null
          size_group_order?: number | null
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          size?: string | null
          size_group?: string | null
          size_group_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      table_refresh_history: {
        Row: {
          end_time: string | null
          error_message: string | null
          refresh_id: number
          refresh_method: string
          rows_affected: number | null
          start_time: string
          status: string | null
          table_name: string
        }
        Insert: {
          end_time?: string | null
          error_message?: string | null
          refresh_id?: number
          refresh_method: string
          rows_affected?: number | null
          start_time: string
          status?: string | null
          table_name: string
        }
        Update: {
          end_time?: string | null
          error_message?: string | null
          refresh_id?: number
          refresh_method?: string
          rows_affected?: number | null
          start_time?: string
          status?: string | null
          table_name?: string
        }
        Relationships: []
      }
      variants: {
        Row: {
          available: boolean | null
          compare_at_price: number | null
          created_at: string | null
          created_at_external: string | null
          discount_percentage: number | null
          featured_image: string | null
          grams: number | null
          id: number
          inventory_quantity: number | null
          is_price_lower: boolean | null
          last_modified: string
          last_size_group_update: string | null
          last_updated: string
          option1: string | null
          option2: string | null
          option3: string | null
          position: number | null
          price: number | null
          product_id: number | null
          requires_shipping: boolean | null
          size_group_id: number | null
          sku: string | null
          taxable: boolean | null
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
          variant_type: string | null
        }
        Insert: {
          available?: boolean | null
          compare_at_price?: number | null
          created_at?: string | null
          created_at_external?: string | null
          discount_percentage?: number | null
          featured_image?: string | null
          grams?: number | null
          id: number
          inventory_quantity?: number | null
          is_price_lower?: boolean | null
          last_modified?: string
          last_size_group_update?: string | null
          last_updated?: string
          option1?: string | null
          option2?: string | null
          option3?: string | null
          position?: number | null
          price?: number | null
          product_id?: number | null
          requires_shipping?: boolean | null
          size_group_id?: number | null
          sku?: string | null
          taxable?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          variant_type?: string | null
        }
        Update: {
          available?: boolean | null
          compare_at_price?: number | null
          created_at?: string | null
          created_at_external?: string | null
          discount_percentage?: number | null
          featured_image?: string | null
          grams?: number | null
          id?: number
          inventory_quantity?: number | null
          is_price_lower?: boolean | null
          last_modified?: string
          last_size_group_update?: string | null
          last_updated?: string
          option1?: string | null
          option2?: string | null
          option3?: string | null
          position?: number | null
          price?: number | null
          product_id?: number | null
          requires_shipping?: boolean | null
          size_group_id?: number | null
          sku?: string | null
          taxable?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          variant_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_size_group_id_fkey"
            columns: ["size_group_id"]
            isOneToOne: false
            referencedRelation: "size_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          comment_id: string | null
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_types"]
          id: string
          product_id: number | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          entity_type: Database["public"]["Enums"]["entity_types"]
          id?: string
          product_id?: number | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_types"]
          id?: string
          product_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_min_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey1"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      distinct_collection_titles: {
        Row: {
          title: string | null
        }
        Relationships: []
      }
      distinct_shop_names: {
        Row: {
          shop_name: string | null
        }
        Relationships: []
      }
      distinct_size_groups_and_types: {
        Row: {
          size_group: string | null
          type: string | null
        }
        Relationships: []
      }
      distinct_variant_titles: {
        Row: {
          title: string | null
        }
        Relationships: []
      }
      distinct_vendors: {
        Row: {
          vendor: string | null
        }
        Relationships: []
      }
      product_min_prices: {
        Row: {
          id: number | null
          min_price: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_fts: {
        Args: { title: string; description: string; tags: string[] }
        Returns: unknown
      }
      get_price_range: {
        Args: {
          shop_names: string[]
          in_stock: boolean
          on_sale: boolean
          search_query: string
        }
        Returns: {
          min_price: number
          max_price: number
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      increment_votes: {
        Args: { deal_id: string }
        Returns: undefined
      }
      refresh_all_products: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      refresh_product_details: {
        Args: { product_id: number }
        Returns: undefined
      }
      refresh_products_batch: {
        Args: { product_ids: number[] }
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
    }
    Enums: {
      entity_types: "comment" | "user" | "deal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      entity_types: ["comment", "user", "deal"],
    },
  },
} as const