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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      calls: {
        Row: {
          created_at: string
          end_at: string | null
          google_event_id: string | null
          id: string
          lead_email: string | null
          meet_link: string | null
          notes: string | null
          owner_user_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["call_status"]
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          google_event_id?: string | null
          id?: string
          lead_email?: string | null
          meet_link?: string | null
          notes?: string | null
          owner_user_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Update: {
          created_at?: string
          end_at?: string | null
          google_event_id?: string | null
          id?: string
          lead_email?: string | null
          meet_link?: string | null
          notes?: string | null
          owner_user_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_email_fkey"
            columns: ["lead_email"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["email"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          refresh_token: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          refresh_token: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          refresh_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      lead_products: {
        Row: {
          id: string
          last_purchase_at: string | null
          last_status_enum: string | null
          lead_email: string
          plan_code: string | null
          product_code: string
          product_name: string | null
          total_paid_amount: number
          total_purchases_count: number
        }
        Insert: {
          id?: string
          last_purchase_at?: string | null
          last_status_enum?: string | null
          lead_email: string
          plan_code?: string | null
          product_code: string
          product_name?: string | null
          total_paid_amount?: number
          total_purchases_count?: number
        }
        Update: {
          id?: string
          last_purchase_at?: string | null
          last_status_enum?: string | null
          lead_email?: string
          plan_code?: string | null
          product_code?: string
          product_name?: string | null
          total_paid_amount?: number
          total_purchases_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_products_lead_email_fkey"
            columns: ["lead_email"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["email"]
          },
        ]
      }
      leads: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_billet_url: string | null
          last_date_approved: string | null
          last_date_created: string | null
          last_payment_type: string | null
          last_product: string | null
          last_sale_amount: number | null
          last_sale_status_enum: string | null
          owner_user_id: string | null
          phone_e164: string | null
          phone_formatted: string | null
          src: string | null
          state: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          last_billet_url?: string | null
          last_date_approved?: string | null
          last_date_created?: string | null
          last_payment_type?: string | null
          last_product?: string | null
          last_sale_amount?: number | null
          last_sale_status_enum?: string | null
          owner_user_id?: string | null
          phone_e164?: string | null
          phone_formatted?: string | null
          src?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_billet_url?: string | null
          last_date_approved?: string | null
          last_date_created?: string | null
          last_payment_type?: string | null
          last_product?: string | null
          last_sale_amount?: number | null
          last_sale_status_enum?: string | null
          owner_user_id?: string | null
          phone_e164?: string | null
          phone_formatted?: string | null
          src?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read_at: string | null
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read_at?: string | null
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read_at?: string | null
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_webhooks: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          response_json: Json | null
          sent_at: string | null
          status: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          response_json?: Json | null
          sent_at?: string | null
          status?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          response_json?: Json | null
          sent_at?: string | null
          status?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_webhooks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          dosage: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          price: number
          short_description: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          dosage?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          price?: number
          short_description?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          dosage?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price?: number
          short_description?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone_e164: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          whatsapp_notifications_enabled: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone_e164?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          whatsapp_notifications_enabled?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone_e164?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          whatsapp_notifications_enabled?: boolean
        }
        Relationships: []
      }
      sales: {
        Row: {
          billet_url: string | null
          checkout_type_enum: string | null
          code: string
          created_at: string
          date_approved: string | null
          date_created: string | null
          id: string
          lead_email: string
          payment_method_enum: string | null
          payment_type_enum: string | null
          plan_code: string | null
          plan_name: string | null
          product_code: string | null
          product_name: string | null
          sale_amount: number | null
          sale_status_detail: string | null
          sale_status_enum: string | null
        }
        Insert: {
          billet_url?: string | null
          checkout_type_enum?: string | null
          code: string
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          id?: string
          lead_email: string
          payment_method_enum?: string | null
          payment_type_enum?: string | null
          plan_code?: string | null
          plan_name?: string | null
          product_code?: string | null
          product_name?: string | null
          sale_amount?: number | null
          sale_status_detail?: string | null
          sale_status_enum?: string | null
        }
        Update: {
          billet_url?: string | null
          checkout_type_enum?: string | null
          code?: string
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          id?: string
          lead_email?: string
          payment_method_enum?: string | null
          payment_type_enum?: string | null
          plan_code?: string | null
          plan_name?: string | null
          product_code?: string | null
          product_name?: string | null
          sale_amount?: number | null
          sale_status_detail?: string | null
          sale_status_enum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_email_fkey"
            columns: ["lead_email"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["email"]
          },
        ]
      }
      task_comments: {
        Row: {
          created_at: string
          id: string
          mentions: Json | null
          message: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentions?: Json | null
          message: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentions?: Json | null
          message?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_whatsapp_notifications: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          message_type: string
          recipient_phone: string
          recipient_user_id: string
          sent_at: string | null
          status: string
          task_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type: string
          recipient_phone: string
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          task_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          recipient_phone?: string
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          task_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_whatsapp_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          checklist: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_email: string | null
          owner_user_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_email?: string | null
          owner_user_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_email?: string | null
          owner_user_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_email_fkey"
            columns: ["lead_email"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["email"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          processed: boolean
          source: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload: Json
          processed?: boolean
          source?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "team"
      call_status: "scheduled" | "completed" | "canceled" | "no_show"
      lead_status: "novo" | "quase_comprou" | "comprou" | "perdido"
      sale_status:
        | "approved"
        | "pending"
        | "refunded"
        | "chargeback"
        | "canceled"
        | "blocked"
        | "complete"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status: "backlog" | "em_andamento" | "bloqueado" | "concluido"
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
    Enums: {
      app_role: ["admin", "team"],
      call_status: ["scheduled", "completed", "canceled", "no_show"],
      lead_status: ["novo", "quase_comprou", "comprou", "perdido"],
      sale_status: [
        "approved",
        "pending",
        "refunded",
        "chargeback",
        "canceled",
        "blocked",
        "complete",
      ],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["backlog", "em_andamento", "bloqueado", "concluido"],
    },
  },
} as const
