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
    PostgrestVersion: "14.5"
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
      ad_visits: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          ip: string | null
          landing_url: string | null
          project: string
          referrer: string | null
          rt_vid: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          ip?: string | null
          landing_url?: string | null
          project: string
          referrer?: string | null
          rt_vid: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          ip?: string | null
          landing_url?: string | null
          project?: string
          referrer?: string | null
          rt_vid?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
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
      baileys_button_flows: {
        Row: {
          button_id: string
          created_at: string | null
          id: string
          messages: Json | null
          webhook_id: string | null
        }
        Insert: {
          button_id: string
          created_at?: string | null
          id?: string
          messages?: Json | null
          webhook_id?: string | null
        }
        Update: {
          button_id?: string
          created_at?: string | null
          id?: string
          messages?: Json | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baileys_button_flows_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      baileys_conversations: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          is_group: boolean | null
          jid: string
          last_message: string | null
          last_message_at: string | null
          session_id: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_group?: boolean | null
          jid: string
          last_message?: string | null
          last_message_at?: string | null
          session_id: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_group?: boolean | null
          jid?: string
          last_message?: string | null
          last_message_at?: string | null
          session_id?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      baileys_messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          direction: string
          from_jid: string | null
          from_name: string | null
          id: string
          message_id: string
          session_id: string
          timestamp: string
          type: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direction: string
          from_jid?: string | null
          from_name?: string | null
          id?: string
          message_id: string
          session_id: string
          timestamp: string
          type?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direction?: string
          from_jid?: string | null
          from_name?: string | null
          id?: string
          message_id?: string
          session_id?: string
          timestamp?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baileys_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "baileys_conversations"
            referencedColumns: ["id"]
          },
        ]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
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
      charge_installments: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          paid_at: string | null
          receipt_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          paid_at?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          paid_at?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_installments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          assigned_to: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          entry_paid: number
          entry_receipt_url: string | null
          id: string
          installment_value: number
          installments_count: number
          notes: string | null
          product_name: string
          project_id: string | null
          status: string
          total_ticket: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          entry_paid?: number
          entry_receipt_url?: string | null
          id?: string
          installment_value: number
          installments_count?: number
          notes?: string | null
          product_name: string
          project_id?: string | null
          status?: string
          total_ticket: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          entry_paid?: number
          entry_receipt_url?: string | null
          id?: string
          installment_value?: number
          installments_count?: number
          notes?: string | null
          product_name?: string
          project_id?: string | null
          status?: string
          total_ticket?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_purchases: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          phone: string
          product_name: string
        }
        Insert: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          phone: string
          product_name: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          phone?: string
          product_name?: string
        }
        Relationships: []
      }
      copy_files: {
        Row: {
          copy_item_id: string | null
          copy_project_id: string
          created_at: string
          file_name: string
          file_size_kb: number | null
          file_type: string | null
          file_url: string
          folder: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          copy_item_id?: string | null
          copy_project_id: string
          created_at?: string
          file_name: string
          file_size_kb?: number | null
          file_type?: string | null
          file_url: string
          folder?: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          copy_item_id?: string | null
          copy_project_id?: string
          created_at?: string
          file_name?: string
          file_size_kb?: number | null
          file_type?: string | null
          file_url?: string
          folder?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_files_copy_item_id_fkey"
            columns: ["copy_item_id"]
            isOneToOne: false
            referencedRelation: "copy_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_files_copy_project_id_fkey"
            columns: ["copy_project_id"]
            isOneToOne: false
            referencedRelation: "copy_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_item_versions: {
        Row: {
          content: string
          copy_item_id: string
          created_at: string
          id: string
          saved_by: string | null
        }
        Insert: {
          content?: string
          copy_item_id: string
          created_at?: string
          id?: string
          saved_by?: string | null
        }
        Update: {
          content?: string
          copy_item_id?: string
          created_at?: string
          id?: string
          saved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_item_versions_copy_item_id_fkey"
            columns: ["copy_item_id"]
            isOneToOne: false
            referencedRelation: "copy_items"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_items: {
        Row: {
          content: string
          copy_project_id: string
          created_at: string
          created_by: string | null
          id: string
          is_validated: boolean
          sort_order: number
          structured_content: Json | null
          tags: string[] | null
          title: string
          translated_content: Json | null
          type: string
          updated_at: string
        }
        Insert: {
          content?: string
          copy_project_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_validated?: boolean
          sort_order?: number
          structured_content?: Json | null
          tags?: string[] | null
          title?: string
          translated_content?: Json | null
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          copy_project_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_validated?: boolean
          sort_order?: number
          structured_content?: Json | null
          tags?: string[] | null
          title?: string
          translated_content?: Json | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copy_items_copy_project_id_fkey"
            columns: ["copy_project_id"]
            isOneToOne: false
            referencedRelation: "copy_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copy_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_list_contacts: {
        Row: {
          added_at: string | null
          email: string
          id: string
          list_id: string | null
          name: string | null
          payload: Json | null
          phone: string | null
          source: string | null
        }
        Insert: {
          added_at?: string | null
          email: string
          id?: string
          list_id?: string | null
          name?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
        }
        Update: {
          added_at?: string | null
          email?: string
          id?: string
          list_id?: string | null
          name?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_list_contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "dynamic_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_lists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          audience_meta: Json | null
          created_at: string | null
          error_message: string | null
          html: string
          id: string
          pending_recipients: Json | null
          recipient_count: number | null
          scheduled_at: string | null
          sender_id: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          audience_meta?: Json | null
          created_at?: string | null
          error_message?: string | null
          html: string
          id?: string
          pending_recipients?: Json | null
          recipient_count?: number | null
          scheduled_at?: string | null
          sender_id?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          audience_meta?: Json | null
          created_at?: string | null
          error_message?: string | null
          html?: string
          id?: string
          pending_recipients?: Json | null
          recipient_count?: number | null
          scheduled_at?: string | null
          sender_id?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "email_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          brevo_message_id: string | null
          campaign_id: string | null
          created_at: string | null
          email: string
          event_type: string
          id: string
          occurred_at: string | null
          sender_id: string | null
          url: string | null
        }
        Insert: {
          brevo_message_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          email: string
          event_type: string
          id?: string
          occurred_at?: string | null
          sender_id?: string | null
          url?: string | null
        }
        Update: {
          brevo_message_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          email?: string
          event_type?: string
          id?: string
          occurred_at?: string | null
          sender_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "email_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_senders: {
        Row: {
          brevo_api_key: string
          created_at: string | null
          display_name: string
          from_email: string
          id: string
          is_active: boolean | null
          reply_to: string | null
          webhook_secret: string | null
        }
        Insert: {
          brevo_api_key: string
          created_at?: string | null
          display_name: string
          from_email: string
          id?: string
          is_active?: boolean | null
          reply_to?: string | null
          webhook_secret?: string | null
        }
        Update: {
          brevo_api_key?: string
          created_at?: string | null
          display_name?: string
          from_email?: string
          id?: string
          is_active?: boolean | null
          reply_to?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      funnel_enrollments: {
        Row: {
          created_at: string | null
          current_node_id: string | null
          current_step: number | null
          error_message: string | null
          funnel_id: string | null
          id: string
          jid: string
          next_send_at: string | null
          phone: string
          status: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          current_node_id?: string | null
          current_step?: number | null
          error_message?: string | null
          funnel_id?: string | null
          id?: string
          jid: string
          next_send_at?: string | null
          phone: string
          status?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          current_node_id?: string | null
          current_step?: number | null
          error_message?: string | null
          funnel_id?: string | null
          id?: string
          jid?: string
          next_send_at?: string | null
          phone?: string
          status?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_enrollments_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          created_at: string | null
          graph: Json | null
          id: string
          is_active: boolean | null
          name: string
          session_id: string
          steps: Json | null
          trigger_event_type: string | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          graph?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          session_id: string
          steps?: Json | null
          trigger_event_type?: string | null
          trigger_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          graph?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          session_id?: string
          steps?: Json | null
          trigger_event_type?: string | null
          trigger_type?: string
          updated_at?: string | null
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
      ig_automations: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          keywords: string[]
          link_button_label: string | null
          link_text: string | null
          link_url: string | null
          match_type: string | null
          name: string
          post_id: string | null
          public_replies: string[] | null
          quick_reply_label: string | null
          reminder_delay_minutes: number | null
          reminder_text: string | null
          triggers: string[] | null
          updated_at: string | null
          welcome_dm: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          link_button_label?: string | null
          link_text?: string | null
          link_url?: string | null
          match_type?: string | null
          name: string
          post_id?: string | null
          public_replies?: string[] | null
          quick_reply_label?: string | null
          reminder_delay_minutes?: number | null
          reminder_text?: string | null
          triggers?: string[] | null
          updated_at?: string | null
          welcome_dm?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          link_button_label?: string | null
          link_text?: string | null
          link_url?: string | null
          match_type?: string | null
          name?: string
          post_id?: string | null
          public_replies?: string[] | null
          quick_reply_label?: string | null
          reminder_delay_minutes?: number | null
          reminder_text?: string | null
          triggers?: string[] | null
          updated_at?: string | null
          welcome_dm?: string | null
        }
        Relationships: []
      }
      ig_config: {
        Row: {
          access_token: string
          created_at: string | null
          id: string
          instagram_user_id: string
          name: string | null
          profile_picture_url: string | null
          token_expires_at: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          id?: string
          instagram_user_id: string
          name?: string | null
          profile_picture_url?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          id?: string
          instagram_user_id?: string
          name?: string | null
          profile_picture_url?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      ig_contacts: {
        Row: {
          created_at: string | null
          first_contact_at: string | null
          id: string
          instagram_user_id: string
          last_automation_id: string | null
          last_reply_at: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          first_contact_at?: string | null
          id?: string
          instagram_user_id: string
          last_automation_id?: string | null
          last_reply_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          first_contact_at?: string | null
          id?: string
          instagram_user_id?: string
          last_automation_id?: string | null
          last_reply_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_contacts_last_automation_id_fkey"
            columns: ["last_automation_id"]
            isOneToOne: false
            referencedRelation: "ig_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_events: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
        }
        Relationships: []
      }
      ig_queue: {
        Row: {
          automation_id: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string | null
          error: string | null
          id: string
          message_body: Json
          message_type: string
          recipient_comment_id: string | null
          recipient_ig_user_id: string
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          automation_id?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          message_body: Json
          message_type: string
          recipient_comment_id?: string | null
          recipient_ig_user_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          automation_id?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          message_body?: Json
          message_type?: string
          recipient_comment_id?: string | null
          recipient_ig_user_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_queue_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "ig_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ig_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ig_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          implementation_id: string
          title: string
          type: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          implementation_id: string
          title: string
          type?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          implementation_id?: string
          title?: string
          type?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "implementation_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_documents_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          implementation_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          implementation_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          implementation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_notes_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          implementation_id: string
          order_index: number
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          implementation_id: string
          order_index?: number
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          implementation_id?: string
          order_index?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_steps_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_template_steps: {
        Row: {
          description: string | null
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          order_index?: number
          template_id: string
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "implementation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      implementations: {
        Row: {
          assigned_to: string | null
          charge_id: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          contract_end: string
          contract_start: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          paid_amount: number
          status: string
          total_value: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          charge_id?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          contract_end: string
          contract_start: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          paid_amount?: number
          status?: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          charge_id?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          contract_end?: string
          contract_start?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          paid_amount?: number
          status?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementations_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "client_ltv"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "implementations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
          project_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          project_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "client_ltv"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "lead_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string
          follow_up_at: string | null
          follow_up_note: string | null
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
          project_id: string | null
          source: string | null
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
          assigned_to?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          follow_up_at?: string | null
          follow_up_note?: string | null
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
          project_id?: string | null
          source?: string | null
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
          assigned_to?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          follow_up_at?: string | null
          follow_up_note?: string | null
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
          project_id?: string | null
          source?: string | null
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
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          access_token: string
          account_id: string
          account_name: string | null
          created_at: string
          id: string
          is_active: boolean | null
          project_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          account_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          project_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          account_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          project_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          ad_id: string
          ad_name: string | null
          adset_id: string
          clicks: number | null
          conversions: number | null
          created_at: string
          creative_thumbnail_url: string | null
          date: string
          follows: number | null
          id: string
          impressions: number | null
          initiate_checkout: number | null
          spend: number | null
          status: string | null
          video_p75_watched: number | null
          video_plays: number | null
          video_view: number | null
        }
        Insert: {
          ad_id: string
          ad_name?: string | null
          adset_id: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          creative_thumbnail_url?: string | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          spend?: number | null
          status?: string | null
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Update: {
          ad_id?: string
          ad_name?: string | null
          adset_id?: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          creative_thumbnail_url?: string | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          spend?: number | null
          status?: string | null
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "adset_performance"
            referencedColumns: ["adset_uuid"]
          },
          {
            foreignKeyName: "meta_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          adset_id: string
          adset_name: string | null
          bid_amount: number | null
          campaign_id: string
          clicks: number | null
          conversions: number | null
          created_at: string
          daily_budget: number | null
          date: string
          follows: number | null
          id: string
          impressions: number | null
          initiate_checkout: number | null
          lifetime_budget: number | null
          spend: number | null
          status: string | null
          video_p75_watched: number | null
          video_plays: number | null
          video_view: number | null
        }
        Insert: {
          adset_id: string
          adset_name?: string | null
          bid_amount?: number | null
          campaign_id: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_budget?: number | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          lifetime_budget?: number | null
          spend?: number | null
          status?: string | null
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Update: {
          adset_id?: string
          adset_name?: string | null
          bid_amount?: number | null
          campaign_id?: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_budget?: number | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          lifetime_budget?: number | null
          spend?: number | null
          status?: string | null
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "adset_performance"
            referencedColumns: ["campaign_uuid"]
          },
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_performance"
            referencedColumns: ["campaign_uuid"]
          },
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          ad_account_id: string
          bid_amount: number | null
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          cpa: number | null
          created_at: string
          daily_budget: number | null
          date: string
          follows: number | null
          id: string
          impressions: number | null
          initiate_checkout: number | null
          lifetime_budget: number | null
          objective: string | null
          revenue: number | null
          roas: number | null
          spend: number | null
          status: string | null
          updated_at: string
          video_p75_watched: number | null
          video_plays: number | null
          video_view: number | null
        }
        Insert: {
          ad_account_id: string
          bid_amount?: number | null
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          created_at?: string
          daily_budget?: number | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          lifetime_budget?: number | null
          objective?: string | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Update: {
          ad_account_id?: string
          bid_amount?: number | null
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          created_at?: string
          daily_budget?: number | null
          date?: string
          follows?: number | null
          id?: string
          impressions?: number | null
          initiate_checkout?: number | null
          lifetime_budget?: number | null
          objective?: string | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          video_p75_watched?: number | null
          video_plays?: number | null
          video_view?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_custom_metrics: {
        Row: {
          ad_account_id: string
          created_at: string
          formula: string
          id: string
          name: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          formula: string
          id?: string
          name: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          formula?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_custom_metrics_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_rules: {
        Row: {
          action_type: string
          action_value: string | null
          ad_account_id: string
          condition_metric: string
          condition_operator: string
          condition_period: string | null
          condition_value: number
          created_at: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
        }
        Insert: {
          action_type: string
          action_value?: string | null
          ad_account_id: string
          condition_metric: string
          condition_operator: string
          condition_period?: string | null
          condition_value: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
        }
        Update: {
          action_type?: string
          action_value?: string | null
          ad_account_id?: string
          condition_metric?: string
          condition_operator?: string
          condition_period?: string | null
          condition_value?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_rules_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      nutra_sales: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          amount: number | null
          campaign_id: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          order_id: string | null
          payment_method: string | null
          product_id: string | null
          product_name: string | null
          project_id: string
          raw_payload: Json | null
          source: string
          status: string | null
          tracking_code: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          amount?: number | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          product_name?: string | null
          project_id: string
          raw_payload?: Json | null
          source: string
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          amount?: number | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          product_name?: string | null
          project_id?: string
          raw_payload?: Json | null
          source?: string
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutra_sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          assigned_to: string | null
          availability: string | null
          charge_id: string | null
          completed_at: string | null
          created_at: string
          current_revenue: string | null
          expectations: string | null
          full_name: string | null
          how_found: string | null
          id: string
          lead_id: string | null
          main_goal: string | null
          niche: string | null
          phone: string | null
          project_id: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          availability?: string | null
          charge_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_revenue?: string | null
          expectations?: string | null
          full_name?: string | null
          how_found?: string | null
          id?: string
          lead_id?: string | null
          main_goal?: string | null
          niche?: string | null
          phone?: string | null
          project_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          availability?: string | null
          charge_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_revenue?: string | null
          expectations?: string | null
          full_name?: string | null
          how_found?: string | null
          id?: string
          lead_id?: string | null
          main_goal?: string | null
          niche?: string | null
          phone?: string | null
          project_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "client_ltv"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "onboarding_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      perfectpay_events: {
        Row: {
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          error_message: string | null
          event_type: string | null
          id: string
          integration_id: string | null
          product_name: string | null
          raw_payload: Json | null
          received_at: string | null
          sale_amount: number | null
          sale_id: string | null
          status: string | null
          wa_sent: boolean | null
        }
        Insert: {
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          sale_amount?: number | null
          sale_id?: string | null
          status?: string | null
          wa_sent?: boolean | null
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          sale_amount?: number | null
          sale_id?: string | null
          status?: string | null
          wa_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "perfectpay_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "perfectpay_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      perfectpay_integrations: {
        Row: {
          created_at: string | null
          dynamic_list_id: string | null
          filter_products: string[] | null
          id: string
          is_active: boolean | null
          name: string
          only_approved: boolean | null
          token: string
          wa_initial_delay_ms: number | null
          wa_interval_ms: number | null
          wa_messages: Json | null
          wa_session_id: string | null
        }
        Insert: {
          created_at?: string | null
          dynamic_list_id?: string | null
          filter_products?: string[] | null
          id?: string
          is_active?: boolean | null
          name: string
          only_approved?: boolean | null
          token?: string
          wa_initial_delay_ms?: number | null
          wa_interval_ms?: number | null
          wa_messages?: Json | null
          wa_session_id?: string | null
        }
        Update: {
          created_at?: string | null
          dynamic_list_id?: string | null
          filter_products?: string[] | null
          id?: string
          is_active?: boolean | null
          name?: string
          only_approved?: boolean | null
          token?: string
          wa_initial_delay_ms?: number | null
          wa_interval_ms?: number | null
          wa_messages?: Json | null
          wa_session_id?: string | null
        }
        Relationships: []
      }
      product_goals: {
        Row: {
          created_at: string
          created_by: string | null
          goal_amount: number
          id: string
          period_end: string
          period_start: string
          product_id: string | null
          product_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          goal_amount: number
          id?: string
          period_end: string
          period_start: string
          product_id?: string | null
          product_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          goal_amount?: number
          id?: string
          period_end?: string
          period_start?: string
          product_id?: string | null
          product_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_goals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      project_products: {
        Row: {
          created_at: string
          id: string
          product_code: string
          product_name: string | null
          project_id: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_code: string
          product_name?: string | null
          project_id: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_code?: string
          product_name?: string | null
          project_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      redirects: {
        Row: {
          created_at: string | null
          description: string | null
          destinations: string[]
          hit_count: number | null
          id: string
          round_robin_index: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          destinations?: string[]
          hit_count?: number | null
          id?: string
          round_robin_index?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          destinations?: string[]
          hit_count?: number | null
          id?: string
          round_robin_index?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          billet_url: string | null
          campaign_id: string | null
          checkout_type_enum: string | null
          code: string
          created_at: string
          date_approved: string | null
          date_created: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          lead_email: string
          payment_method_enum: string | null
          payment_type_enum: string | null
          plan_code: string | null
          plan_name: string | null
          product_code: string | null
          product_name: string | null
          project_id: string | null
          sale_amount: number | null
          sale_status_detail: string | null
          sale_status_enum: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          billet_url?: string | null
          campaign_id?: string | null
          checkout_type_enum?: string | null
          code: string
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          lead_email: string
          payment_method_enum?: string | null
          payment_type_enum?: string | null
          plan_code?: string | null
          plan_name?: string | null
          product_code?: string | null
          product_name?: string | null
          project_id?: string | null
          sale_amount?: number | null
          sale_status_detail?: string | null
          sale_status_enum?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          billet_url?: string | null
          campaign_id?: string | null
          checkout_type_enum?: string | null
          code?: string
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          lead_email?: string
          payment_method_enum?: string | null
          payment_type_enum?: string | null
          plan_code?: string | null
          plan_name?: string | null
          product_code?: string | null
          product_name?: string | null
          project_id?: string | null
          sale_amount?: number | null
          sale_status_detail?: string | null
          sale_status_enum?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_email_fkey"
            columns: ["lead_email"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_project_access: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
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
      wa_contacts: {
        Row: {
          account_id: string | null
          created_at: string | null
          id: string
          name: string | null
          opt_out: boolean | null
          phone: string
          tags: string[] | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          opt_out?: boolean | null
          phone: string
          tags?: string[] | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          opt_out?: boolean | null
          phone?: string
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          contact_id: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          status: string
          window_expires_at: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          window_expires_at?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wa_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_flows: {
        Row: {
          account_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          nodes: Json
          trigger_keyword: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          nodes?: Json
          trigger_keyword?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          nodes?: Json
          trigger_keyword?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_flows_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_internal_notes: {
        Row: {
          author_id: string | null
          content: string
          conversation_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          caption: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          direction: string
          id: string
          media_mime: string | null
          media_url: string | null
          sent_by: string | null
          status: string | null
          type: string
          wa_message_id: string | null
        }
        Insert: {
          caption?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direction: string
          id?: string
          media_mime?: string | null
          media_url?: string | null
          sent_by?: string | null
          status?: string | null
          type?: string
          wa_message_id?: string | null
        }
        Update: {
          caption?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          media_mime?: string | null
          media_url?: string | null
          sent_by?: string | null
          status?: string | null
          type?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_templates: {
        Row: {
          account_id: string | null
          body_preview: string | null
          category: string | null
          components: Json | null
          created_at: string | null
          id: string
          language: string
          name: string
          status: string | null
          synced_at: string | null
          template_id: string | null
        }
        Insert: {
          account_id?: string | null
          body_preview?: string | null
          category?: string | null
          components?: Json | null
          created_at?: string | null
          id?: string
          language?: string
          name: string
          status?: string | null
          synced_at?: string | null
          template_id?: string | null
        }
        Update: {
          account_id?: string | null
          body_preview?: string | null
          category?: string | null
          components?: Json | null
          created_at?: string | null
          id?: string
          language?: string
          name?: string
          status?: string | null
          synced_at?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_webhook_events: {
        Row: {
          account_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          wa_message_id: string | null
        }
        Insert: {
          account_id?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          wa_message_id?: string | null
        }
        Update: {
          account_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_webhook_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          error_message: string | null
          id: string
          payload: Json
          phone: string | null
          processed: boolean
          sent_at: string | null
          source: string
          status: string | null
          webhook_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          error_message?: string | null
          id?: string
          payload: Json
          phone?: string | null
          processed?: boolean
          sent_at?: string | null
          source?: string
          status?: string | null
          webhook_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          phone?: string | null
          processed?: boolean
          sent_at?: string | null
          source?: string
          status?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          initial_delay_ms: number | null
          interval_ms: number | null
          is_active: boolean | null
          messages: Json
          name: string
          session_id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          event_type?: string
          id?: string
          initial_delay_ms?: number | null
          interval_ms?: number | null
          is_active?: boolean | null
          messages?: Json
          name: string
          session_id: string
          token?: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          initial_delay_ms?: number | null
          interval_ms?: number | null
          is_active?: boolean | null
          messages?: Json
          name?: string
          session_id?: string
          token?: string
        }
        Relationships: []
      }
      whatsapp_api_accounts: {
        Row: {
          access_token: string
          app_secret: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          phone_number: string
          phone_number_id: string
          verify_token: string
          waba_id: string
        }
        Insert: {
          access_token: string
          app_secret: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone_number: string
          phone_number_id: string
          verify_token: string
          waba_id: string
        }
        Update: {
          access_token?: string
          app_secret?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone_number?: string
          phone_number_id?: string
          verify_token?: string
          waba_id?: string
        }
        Relationships: []
      }
      whatsapp_api_sends: {
        Row: {
          account_id: string | null
          campaign_name: string | null
          error_code: string | null
          error_message: string | null
          id: string
          list_tag: string | null
          phone: string
          sent_at: string | null
          status: string | null
          template_name: string | null
        }
        Insert: {
          account_id?: string | null
          campaign_name?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          list_tag?: string | null
          phone: string
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
        }
        Update: {
          account_id?: string | null
          campaign_name?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          list_tag?: string | null
          phone?: string
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_api_sends_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_api_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_campaigns: {
        Row: {
          created_at: string | null
          id: string
          name: string
          scheduled_at: string | null
          sent_at: string | null
          session_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          session_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          session_id?: string
          status?: string | null
        }
        Relationships: []
      }
      whatsapp_group_messages: {
        Row: {
          campaign_id: string | null
          caption: string | null
          content: string | null
          created_at: string | null
          delay_ms: number | null
          id: string
          media_storage_path: string | null
          media_url: string | null
          order_index: number
          type: string
        }
        Insert: {
          campaign_id?: string | null
          caption?: string | null
          content?: string | null
          created_at?: string | null
          delay_ms?: number | null
          id?: string
          media_storage_path?: string | null
          media_url?: string | null
          order_index?: number
          type?: string
        }
        Update: {
          campaign_id?: string | null
          caption?: string | null
          content?: string | null
          created_at?: string | null
          delay_ms?: number | null
          id?: string
          media_storage_path?: string | null
          media_url?: string | null
          order_index?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_group_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_targets: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          error: string | null
          group_jid: string
          group_name: string | null
          id: string
          sent: boolean | null
          sent_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          error?: string | null
          group_jid: string
          group_name?: string | null
          id?: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          error?: string | null
          group_jid?: string
          group_name?: string | null
          id?: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_group_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          auth_state: Json | null
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          id: string
          phone_number: string | null
          session_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auth_state?: Json | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_number?: string | null
          session_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_state?: Json | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_number?: string | null
          session_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      ad_performance: {
        Row: {
          ad_account_id: string | null
          ad_id: string | null
          ad_name: string | null
          adset_name: string | null
          campaign_name: string | null
          clicks: number | null
          cpa: number | null
          date: string | null
          impressions: number | null
          profit: number | null
          revenue: number | null
          roas: number | null
          sales_count: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      adset_performance: {
        Row: {
          ad_account_id: string | null
          adset_id: string | null
          adset_name: string | null
          adset_uuid: string | null
          campaign_name: string | null
          campaign_uuid: string | null
          clicks: number | null
          cpa: number | null
          date: string | null
          impressions: number | null
          profit: number | null
          revenue: number | null
          roas: number | null
          sales_count: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance: {
        Row: {
          ad_account_id: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_uuid: string | null
          clicks: number | null
          cpa: number | null
          date: string | null
          impressions: number | null
          profit: number | null
          revenue: number | null
          roas: number | null
          sales_count: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ltv: {
        Row: {
          charges_revenue: number | null
          email: string | null
          first_purchase_at: string | null
          impl_revenue: number | null
          last_purchase_at: string | null
          lead_id: string | null
          ltv: number | null
          name: string | null
          phone: string | null
          project_id: string | null
          sales_revenue: number | null
          segment: string | null
          total_charges: number | null
          total_implementations: number | null
          total_purchases: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_projects: {
        Args: never
        Returns: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_clients: {
        Args: { p_project_id?: string; search_term: string }
        Returns: {
          charges_revenue: number | null
          email: string | null
          first_purchase_at: string | null
          impl_revenue: number | null
          last_purchase_at: string | null
          lead_id: string | null
          ltv: number | null
          name: string | null
          phone: string | null
          project_id: string | null
          sales_revenue: number | null
          segment: string | null
          total_charges: number | null
          total_implementations: number | null
          total_purchases: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "client_ltv"
          isOneToOne: false
          isSetofReturn: true
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
