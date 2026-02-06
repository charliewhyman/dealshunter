export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      images: {
        Row: {
          alt: string | null
          collection_id: number | null
          created_at: string | null
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
          collection_id?: number | null
          created_at?: string | null
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
          collection_id?: number | null
          created_at?: string | null
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
            foreignKeyName: "images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_details_core"
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
          archived_at: string | null
          created_at: string | null
          description: string | null
          description_format: string | null
          fts: unknown
          gender_age: string | null
          gender_categories: string[] | null
          grouped_product_type: string | null
          handle: string | null
          id: number
          images: Json | null
          in_stock: boolean | null
          is_archived: boolean | null
          is_unisex: boolean | null
          last_modified: string | null
          last_updated: string | null
          max_discount_percentage: number | null
          min_price: number | null
          on_sale: boolean | null
          product_type: string | null
          published_at_external: string | null
          scheduled_hard_delete: string | null
          shop_domain: string | null
          shop_id: number | null
          shop_name: string | null
          size_groups: string[] | null
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
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          description_format?: string | null
          fts?: unknown
          gender_age?: string | null
          gender_categories?: string[] | null
          grouped_product_type?: string | null
          handle?: string | null
          id: number
          images?: Json | null
          in_stock?: boolean | null
          is_archived?: boolean | null
          is_unisex?: boolean | null
          last_modified?: string | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          product_type?: string | null
          published_at_external?: string | null
          scheduled_hard_delete?: string | null
          shop_domain?: string | null
          shop_id?: number | null
          shop_name?: string | null
          size_groups?: string[] | null
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
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          description_format?: string | null
          fts?: unknown
          gender_age?: string | null
          gender_categories?: string[] | null
          grouped_product_type?: string | null
          handle?: string | null
          id?: number
          images?: Json | null
          in_stock?: boolean | null
          is_archived?: boolean | null
          is_unisex?: boolean | null
          last_modified?: string | null
          last_updated?: string | null
          max_discount_percentage?: number | null
          min_price?: number | null
          on_sale?: boolean | null
          product_type?: string | null
          published_at_external?: string | null
          scheduled_hard_delete?: string | null
          shop_domain?: string | null
          shop_id?: number | null
          shop_name?: string | null
          size_groups?: string[] | null
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
      size_groups: {
        Row: {
          created_at: string | null
          size_group: string
          sort_order_1: number
          sort_order_2: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          size_group: string
          sort_order_1: number
          sort_order_2?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          size_group?: string
          sort_order_1?: number
          sort_order_2?: number | null
          updated_at?: string | null
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
          size: string | null
          sort_order_1: number | null
          sort_order_2: number | null
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
          size?: string | null
          sort_order_1?: number | null
          sort_order_2?: number | null
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
          size?: string | null
          sort_order_1?: number | null
          sort_order_2?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
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
        Insert: {
          id?: number | null
          name?: never
        }
        Update: {
          id?: number | null
          name?: never
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
    }
    Functions: {
      get_products_pricing: {
        Args: { p_product_ids: number[] }
        Returns: {
          compare_at_price: number
          offer_price: number
          product_id: number
          variant_price: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
