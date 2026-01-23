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
  size_groups?: string[];
  variants?: VariantDetail[];
  images?: ImageDetail[];
  grouped_product_type?: string | null;
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

// Supabase
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
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
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
          collection_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          handle: string | null
          id: number
          products_count: number | null
          published_at_external: string | null
          shop_id: number
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
        }
        Insert: {
          collection_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id?: number
          products_count?: number | null
          published_at_external?: string | null
          shop_id: number
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Update: {
          collection_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id?: number
          products_count?: number | null
          published_at_external?: string | null
          shop_id?: number
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "distinct_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      image_base_urls: {
        Row: {
          base_url: string
          created_at: string | null
          id: number
        }
        Insert: {
          base_url: string
          created_at?: string | null
          id?: number
        }
        Update: {
          base_url?: string
          created_at?: string | null
          id?: number
        }
        Relationships: []
      }
      images: {
        Row: {
          alt: string | null
          base_url_id: number | null
          collection_id: number | null
          created_at: string | null
          file_path: string | null
          height: number | null
          id: number
          last_modified: string
          position: number | null
          product_id: number | null
          src: string | null
          updated_at: string | null
          version: string | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          base_url_id?: number | null
          collection_id?: number | null
          created_at?: string | null
          file_path?: string | null
          height?: number | null
          id: number
          last_modified?: string
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          version?: string | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          base_url_id?: number | null
          collection_id?: number | null
          created_at?: string | null
          file_path?: string | null
          height?: number | null
          id?: number
          last_modified?: string
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          version?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_base_url_id_fkey"
            columns: ["base_url_id"]
            isOneToOne: false
            referencedRelation: "image_base_urls"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "products_with_details_core"
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
            referencedRelation: "products_with_details_core"
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
            referencedRelation: "products_with_details_core"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          fts: unknown
          handle: string | null
          id: number
          last_modified: string
          last_updated: string | null
          product_type: string | null
          published_at_external: string | null
          shop_id: number
          tags: string[] | null
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
          url: string | null
          vendor: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          fts?: unknown
          handle?: string | null
          id: number
          last_modified?: string
          last_updated?: string | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id: number
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          fts?: unknown
          handle?: string | null
          id?: number
          last_modified?: string
          last_updated?: string | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id?: number
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "distinct_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products_enriched_data: {
        Row: {
          categories: string[] | null
          last_enriched: string | null
          product_id: number
          size_groups: string[] | null
        }
        Insert: {
          categories?: string[] | null
          last_enriched?: string | null
          product_id: number
          size_groups?: string[] | null
        }
        Update: {
          categories?: string[] | null
          last_enriched?: string | null
          product_id?: number
          size_groups?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_enriched_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_with_details_core"
            referencedColumns: ["id"]
          },
        ]
      }
      products_with_details_core: {
        Row: {
          created_at: string | null
          description: string | null
          fts: unknown
          gender_age: string | null
          grouped_product_type: string | null
          handle: string | null
          id: number
          images: Json | null
          in_stock: boolean | null
          last_modified: string | null
          last_updated: string | null
          max_discount_percentage: number | null
          min_price: number | null
          on_sale: boolean | null
          product_type: string | null
          published_at_external: string | null
          shop_id: number | null
          shop_name: string | null
          subcategory: string | null
          tags: string[] | null
          title: string | null
          top_level_category: string | null
          updated_at: string | null
          updated_at_external: string | null
          url: string | null
          variants: Json | null
          vendor: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fts?: unknown
          gender_age?: string | null
          grouped_product_type?: string | null
          handle?: string | null
          id: number
          images?: Json | null
          in_stock?: boolean | null
          last_modified?: string | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id?: number | null
          shop_name?: string | null
          subcategory?: string | null
          tags?: string[] | null
          title?: string | null
          top_level_category?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          variants?: Json | null
          vendor?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fts?: unknown
          gender_age?: string | null
          grouped_product_type?: string | null
          handle?: string | null
          id?: number
          images?: Json | null
          in_stock?: boolean | null
          last_modified?: string | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          product_type?: string | null
          published_at_external?: string | null
          shop_id?: number | null
          shop_name?: string | null
          subcategory?: string | null
          tags?: string[] | null
          title?: string | null
          top_level_category?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          variants?: Json | null
          vendor?: string | null
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
      shops: {
        Row: {
          category: string | null
          created_at: string
          id: number
          is_shopify: boolean | null
          location: string | null
          shop_name: string | null
          tags: string[] | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: number
          is_shopify?: boolean | null
          location?: string | null
          shop_name?: string | null
          tags?: string[] | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: number
          is_shopify?: boolean | null
          location?: string | null
          shop_name?: string | null
          tags?: string[] | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      variants: {
        Row: {
          available: boolean | null
          compare_at_price: number | null
          discount_percentage: number | null
          id: number
          price: number | null
          product_id: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          compare_at_price?: number | null
          discount_percentage?: number | null
          id: number
          price?: number | null
          product_id?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          compare_at_price?: number | null
          discount_percentage?: number | null
          id?: number
          price?: number | null
          product_id?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_optimized_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_details_core"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      distinct_gender_ages: {
        Row: {
          gender_age: string | null
        }
        Relationships: []
      }
      distinct_grouped_types: {
        Row: {
          grouped_product_type: string | null
        }
        Relationships: []
      }
      distinct_shops: {
        Row: {
          id: number | null
          name: string | null
        }
        Relationships: []
      }
      distinct_size_groups: {
        Row: {
          size_group: string | null
          sort_order_1: number | null
          sort_order_2: number | null
        }
        Relationships: []
      }
      distinct_top_level_categories: {
        Row: {
          top_level_category: string | null
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
      size_groups_list: {
        Row: {
          size: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      batch_update_product_enriched_data: {
        Args: { product_data: Json }
        Returns: undefined
      }
      clear_product_enriched_data: {
        Args: { p_product_id?: number }
        Returns: undefined
      }
      generate_fts: {
        Args: { description: string; tags: string[]; title: string }
        Returns: unknown
      }
      get_image_srcset: {
        Args: {
          p_base_url_id: number
          p_file_path: string
          p_version: string
          p_webp?: boolean
        }
        Returns: string
      }
      get_image_url: {
        Args: {
          p_base_url_id: number
          p_file_path: string
          p_format?: string
          p_version: string
          p_width?: number
        }
        Returns: string
      }
      get_migration_progress: {
        Args: never
        Returns: {
          batch_size: number
          completed_at: string
          error_message: string
          migration_name: string
          processed_items: number
          progress_percent: number
          started_at: string
          status: string
          total_items: number
        }[]
      }
      get_missing_products_count: { Args: never; Returns: number }
      get_products_by_shop: {
        Args: { p_limit?: number; p_offset?: number; p_shop_ids: string[] }
        Returns: {
          categories: string[]
          created_at: string
          current_row_number: number
          description: string
          fts: unknown
          handle: string
          id: number
          images: Json
          in_stock: boolean
          last_modified: string
          last_updated: string
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          published_at_external: string
          shop_id: number
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_estimated_count: number
          updated_at: string
          url: string
          vendor: string
        }[]
      }
      get_products_by_size: {
        Args: { p_limit?: number; p_offset?: number; p_size_groups: string[] }
        Returns: {
          categories: string[]
          created_at: string
          current_row_number: number
          description: string
          fts: unknown
          handle: string
          id: number
          images: Json
          in_stock: boolean
          last_modified: string
          last_updated: string
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          published_at_external: string
          shop_id: number
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_estimated_count: number
          updated_at: string
          url: string
          vendor: string
        }[]
      }
      get_products_default: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          categories: string[]
          created_at: string
          description: string
          fts: unknown
          handle: string
          id: number
          images: Json
          in_stock: boolean
          last_modified: string
          last_updated: string
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          published_at_external: string
          shop_id: number
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          updated_at_external: string
          url: string
          variants: Json
          vendor: string
        }[]
      }
      get_products_filtered: {
        Args: {
          p_gender_ages?: string[]
          p_grouped_types?: string[]
          p_in_stock_only?: boolean
          p_limit?: number
          p_max_price?: number
          p_min_price?: number
          p_offset?: number
          p_on_sale_only?: boolean
          p_search_query?: string
          p_shop_ids?: string[]
          p_size_groups?: string[]
          p_sort_order?: string
          p_top_level_categories?: string[]
        }
        Returns: {
          categories: string[]
          created_at: string
          description: string
          fts: unknown
          handle: string
          id: string
          images: Json
          in_stock: boolean
          last_modified: string
          last_updated: string
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          published_at_external: string
          shop_id: number
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          updated_at_external: string
          url: string
          variants: Json
          vendor: string
        }[]
      }
      get_products_needing_size_groups: {
        Args: never
        Returns: {
          product_id: number
          size_groups: string[]
        }[]
      }
      get_products_on_sale: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          categories: string[]
          created_at: string
          current_row_number: number
          description: string
          fts: unknown
          handle: string
          id: number
          images: Json
          in_stock: boolean
          last_modified: string
          last_updated: string
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          published_at_external: string
          shop_id: number
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_estimated_count: number
          updated_at: string
          url: string
          vendor: string
        }[]
      }
      get_products_pricing: {
        Args: { p_product_ids: number[] }
        Returns: {
          compare_at_price: number
          offer_price: number
          product_id: number
          variant_price: number
        }[]
      }
      init_database_structure: { Args: never; Returns: undefined }
      migrate_batch_simple: { Args: never; Returns: number }
      normalize_size_groups: {
        Args: { size_groups_arr: string[] }
        Returns: string[]
      }
      populate_all_products_simple: { Args: never; Returns: undefined }
      populate_batch: {
        Args: { batch_size?: number; offset_val?: number }
        Returns: number
      }
      populate_missing_batch: {
        Args: { batch_size?: number; offset_val?: number }
        Returns: number
      }
      refresh_materialized_views: { Args: never; Returns: undefined }
      refresh_product_size_groups_incremental: {
        Args: never
        Returns: {
          products_updated: number
          variants_processed: number
        }[]
      }
      refresh_products_enriched: { Args: never; Returns: undefined }
      refresh_products_full: { Args: never; Returns: undefined }
      refresh_products_with_details: { Args: never; Returns: undefined }
      refresh_size_groups_fast: {
        Args: never
        Returns: {
          products_updated: number
          variants_processed: number
        }[]
      }
      refresh_size_groups_incremental: {
        Args: never
        Returns: {
          products_updated: number
          variants_processed: number
        }[]
      }
      resume_migration: {
        Args: never
        Returns: {
          batch_number: number
          estimated_remaining: number
          products_processed: number
          total_processed: number
        }[]
      }
      safe_text_to_bigint_array: {
        Args: { text_array: string[] }
        Returns: number[]
      }
      search_products_filterable: {
        Args: {
          in_stock_filter?: boolean
          limit_count?: number
          max_price_filter?: number
          min_price_filter?: number
          offset_count?: number
          on_sale_filter?: boolean
          search_query?: string
          shop_ids?: number[]
          size_groups_filter?: string[]
          sort_by?: string
        }
        Returns: {
          created_at: string
          description: string
          handle: string
          id: number
          images: string[]
          in_stock: boolean
          max_discount_percentage: number
          min_price: number
          on_sale: boolean
          product_type: string
          shop_name: string
          size_groups: string[]
          tags: string[]
          title: string
          total_count: number
          url: string
          vendor: string
        }[]
      }
      update_product_enriched_data: {
        Args: {
          p_categories?: string[]
          p_product_id: number
          p_size_groups?: string[]
          p_taxonomy_mapped_at?: string
          p_taxonomy_path?: string[]
        }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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
