// Supabase types
export type Product = Tables<'products'>;

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
      images: {
        Row: {
          alt: string | null
          created_at: string | null
          height: number | null
          id: number
          position: number | null
          product_id: number | null
          src: string | null
          updated_at: string | null
          url: string | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          created_at?: string | null
          height?: number | null
          id: number
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          url?: string | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          created_at?: string | null
          height?: number | null
          id?: number
          position?: number | null
          product_id?: number | null
          src?: string | null
          updated_at?: string | null
          url?: string | null
          width?: number | null
        }
        Relationships: [
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
          handle: string | null
          id: number
          product_type: string | null
          published_at_external: string | null
          shop_name: string | null
          submitted_by: string
          tags: string[] | null
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
          url: string | null
          vendor: string | null
        }
        Insert: {
          created_at?: string | null
          created_at_external?: string | null
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id: number
          product_type?: string | null
          published_at_external?: string | null
          shop_name?: string | null
          submitted_by: string
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
        }
        Update: {
          created_at?: string | null
          created_at_external?: string | null
          deleted_at?: string | null
          description?: string | null
          handle?: string | null
          id?: number
          product_type?: string | null
          published_at_external?: string | null
          shop_name?: string | null
          submitted_by?: string
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      
      variants: {
        Row: {
          available: boolean | null
          compare_at_price: number | null
          created_at: string | null
          created_at_external: string | null
          featured_image: string | null
          grams: number | null
          id: number
          inventory_quantity: number | null
          option1: string | null
          option2: string | null
          option3: string | null
          position: number | null
          price: number | null
          product_id: number | null
          requires_shipping: boolean | null
          sku: string | null
          taxable: boolean | null
          title: string | null
          updated_at: string | null
          updated_at_external: string | null
        }
        Insert: {
          available?: boolean | null
          compare_at_price?: number | null
          created_at?: string | null
          created_at_external?: string | null
          featured_image?: string | null
          grams?: number | null
          id: number
          inventory_quantity?: number | null
          option1?: string | null
          option2?: string | null
          option3?: string | null
          position?: number | null
          price?: number | null
          product_id?: number | null
          requires_shipping?: boolean | null
          sku?: string | null
          taxable?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Update: {
          available?: boolean | null
          compare_at_price?: number | null
          created_at?: string | null
          created_at_external?: string | null
          featured_image?: string | null
          grams?: number | null
          id?: number
          inventory_quantity?: number | null
          option1?: string | null
          option2?: string | null
          option3?: string | null
          position?: number | null
          price?: number | null
          product_id?: number | null
          requires_shipping?: boolean | null
          sku?: string | null
          taxable?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
        }
        Relationships: [
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
      distinct_vendors: {
        Row: {
          vendor: string | null
        }
        Relationships: []
      }
    }
    Enums: {
      entity_types: "user" | "deal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
