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
            referencedRelation: "shops"
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
          placeholder: string | null
          position: number | null
          product_id: number | null
          responsive_fallback: string | null
          src: string | null
          srcset: string | null
          updated_at: string | null
          updated_at_external: string | null
          webp_srcset: string | null
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
          placeholder?: string | null
          position?: number | null
          product_id?: number | null
          responsive_fallback?: string | null
          src?: string | null
          srcset?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          webp_srcset?: string | null
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
          placeholder?: string | null
          position?: number | null
          product_id?: number | null
          responsive_fallback?: string | null
          src?: string | null
          srcset?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          webp_srcset?: string | null
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
      migration_progress: {
        Row: {
          batch_size: number | null
          completed_at: string | null
          error_message: string | null
          id: number
          migration_name: string
          processed_items: number | null
          started_at: string | null
          status: string | null
          total_items: number | null
        }
        Insert: {
          batch_size?: number | null
          completed_at?: string | null
          error_message?: string | null
          id?: number
          migration_name: string
          processed_items?: number | null
          started_at?: string | null
          status?: string | null
          total_items?: number | null
        }
        Update: {
          batch_size?: number | null
          completed_at?: string | null
          error_message?: string | null
          id?: number
          migration_name?: string
          processed_items?: number | null
          started_at?: string | null
          status?: string | null
          total_items?: number | null
        }
        Relationships: []
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
          taxonomy_mapped_at: string | null
          taxonomy_path: string[] | null
        }
        Insert: {
          categories?: string[] | null
          last_enriched?: string | null
          product_id: number
          size_groups?: string[] | null
          taxonomy_mapped_at?: string | null
          taxonomy_path?: string[] | null
        }
        Update: {
          categories?: string[] | null
          last_enriched?: string | null
          product_id?: number
          size_groups?: string[] | null
          taxonomy_mapped_at?: string | null
          taxonomy_path?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_enriched_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_with_details"
            referencedColumns: ["id"]
          },
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
          tags: string[] | null
          title: string | null
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
          tags?: string[] | null
          title?: string | null
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
          tags?: string[] | null
          title?: string | null
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
          size_group: string | null
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
          size_group?: string | null
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
          size_group?: string | null
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
        ]
      }
    }
    Views: {
      distinct_shop_names: {
        Row: {
          shop_name: string | null
        }
        Relationships: []
      }
      distinct_size_groups: {
        Row: {
          product_count: number | null
          size_group: string | null
          variant_count: number | null
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
      products_with_details: {
        Row: {
          categories: string[] | null
          created_at: string | null
          description: string | null
          fts: unknown
          handle: string | null
          id: number | null
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
          size_groups: string[] | null
          tags: string[] | null
          taxonomy_mapped_at: string | null
          taxonomy_path: string[] | null
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
          url: string | null
          variants: Json | null
          vendor: string | null
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
      complete_migration_safely: {
        Args: never
        Returns: {
          batch_number: number
          missing_remaining: number
          products_processed: number
          total_processed: number
        }[]
      }
      generate_fts: {
        Args: { description: string; tags: string[]; title: string }
        Returns: unknown
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
      get_products_needing_size_groups: {
        Args: never
        Returns: {
          product_id: number
          size_groups: string[]
        }[]
      }
      get_products_needing_taxonomy_mapping: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          current_taxonomy_mapped_at: string
          current_taxonomy_path: string[]
          description: string
          product_id: number
          product_type: string
          tags: string[]
          title: string
          vendor: string
        }[]
      }
      get_products_pricing: {
        Args: { product_ids: string[] }
        Returns: {
          compare_at_price: number
          offer_price: number
          product_id: string
          variant_price: number
        }[]
      }
      init_database_structure: { Args: never; Returns: undefined }
      migrate_batch_simple: { Args: never; Returns: number }
      populate_all_products_auto: {
        Args: never
        Returns: {
          batch_number: number
          estimated_remaining: number
          products_processed: number
          total_processed: number
        }[]
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
      refresh_product_size_groups_incremental: {
        Args: never
        Returns: {
          products_updated: number
          variants_processed: number
        }[]
      }
      refresh_products_core: { Args: never; Returns: undefined }
      refresh_products_enriched: { Args: never; Returns: undefined }
      refresh_products_full: { Args: never; Returns: undefined }
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