import { User } from "@supabase/supabase-js";

// Supabase types
export type Product = Tables<'products'>;
export type Comment = Tables<'comments'>;

export interface CommentWithUser extends Comment {
  Products: { id: string };
  profiles: { username: string | null };
  children?: CommentWithUser[];
  parent_comment?: { 
    comment_text: string | null; 
    profiles: { username: string | null };
  };
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

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
          submitted_by: string
          tags: string[] | null
          title: string | null
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
          handle?: string | null
          id: number
          product_type?: string | null
          published_at_external?: string | null
          submitted_by: string
          tags?: string[] | null
          title?: string | null
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
          handle?: string | null
          id?: number
          product_type?: string | null
          published_at_external?: string | null
          submitted_by?: string
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          updated_at_external?: string | null
          url?: string | null
          vendor?: string | null
          votes?: number | null
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
      [_ in never]: never
    }
    Functions: {
      increment_votes:
        | {
            Args: Record<PropertyKey, never>
            Returns: undefined
          }
        | {
            Args: {
              deal_id: string
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
