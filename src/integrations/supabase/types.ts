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
      admin_notifications: {
        Row: {
          id: string
          message: string
          recipient_count: number
          sent_at: string
          sent_by: string
          target: string
          title: string
        }
        Insert: {
          id?: string
          message: string
          recipient_count?: number
          sent_at?: string
          sent_by: string
          target?: string
          title: string
        }
        Update: {
          id?: string
          message?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string
          target?: string
          title?: string
        }
        Relationships: []
      }
      anamnesis_responses: {
        Row: {
          anamnesis_type_id: string | null
          appointment_id: string | null
          client_name: string
          client_phone: string
          company_id: string
          created_at: string
          filled_by: string
          id: string
          notes: string | null
          responses: Json
          service_id: string | null
          updated_at: string
        }
        Insert: {
          anamnesis_type_id?: string | null
          appointment_id?: string | null
          client_name: string
          client_phone: string
          company_id: string
          created_at?: string
          filled_by?: string
          id?: string
          notes?: string | null
          responses?: Json
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          anamnesis_type_id?: string | null
          appointment_id?: string | null
          client_name?: string
          client_phone?: string
          company_id?: string
          created_at?: string
          filled_by?: string
          id?: string
          notes?: string | null
          responses?: Json
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_responses_anamnesis_type_id_fkey"
            columns: ["anamnesis_type_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_responses_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_templates: {
        Row: {
          active: boolean
          anamnesis_type_id: string | null
          company_id: string
          created_at: string
          field_label: string
          field_options: Json | null
          field_type: string
          id: string
          required: boolean
          service_id: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          anamnesis_type_id?: string | null
          company_id: string
          created_at?: string
          field_label: string
          field_options?: Json | null
          field_type?: string
          id?: string
          required?: boolean
          service_id?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          anamnesis_type_id?: string | null
          company_id?: string
          created_at?: string
          field_label?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          required?: boolean
          service_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_templates_anamnesis_type_id_fkey"
            columns: ["anamnesis_type_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_types: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          client_name: string
          client_phone: string
          company_id: string
          created_at: string
          end_time: string
          google_calendar_event_id: string | null
          id: string
          meet_link: string | null
          notes: string | null
          service_id: string | null
          staff_id: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          client_name: string
          client_phone: string
          company_id: string
          created_at?: string
          end_time: string
          google_calendar_event_id?: string | null
          id?: string
          meet_link?: string | null
          notes?: string | null
          service_id?: string | null
          staff_id?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          client_name?: string
          client_phone?: string
          company_id?: string
          created_at?: string
          end_time?: string
          google_calendar_event_id?: string | null
          id?: string
          meet_link?: string | null
          notes?: string | null
          service_id?: string | null
          staff_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          category: string
          company_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          category?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          close_time: string
          company_id: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
        }
        Insert: {
          close_time?: string
          company_id: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
        }
        Update: {
          close_time?: string
          company_id?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_photos: {
        Row: {
          anamnesis_response_id: string | null
          caption: string | null
          company_id: string
          created_at: string
          id: string
          package_id: string | null
          photo_type: string | null
          photo_url: string
          session_id: string | null
        }
        Insert: {
          anamnesis_response_id?: string | null
          caption?: string | null
          company_id: string
          created_at?: string
          id?: string
          package_id?: string | null
          photo_type?: string | null
          photo_url: string
          session_id?: string | null
        }
        Update: {
          anamnesis_response_id?: string | null
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          package_id?: string | null
          photo_type?: string | null
          photo_url?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_photos_anamnesis_response_id_fkey"
            columns: ["anamnesis_response_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_photos_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "session_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          blocked: boolean
          blocked_reason: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          blocked?: boolean
          blocked_reason?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          blocked?: boolean
          blocked_reason?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notification_id: string
          read: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notification_id: string
          read?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notification_id?: string
          read?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          generate_meet_link: boolean
          google_calendar_sync_mode: string
          id: string
          max_capacity_per_slot: number
          min_advance_hours: number
          privacy_policy_text: string | null
          slot_interval: number
        }
        Insert: {
          company_id: string
          created_at?: string
          generate_meet_link?: boolean
          google_calendar_sync_mode?: string
          id?: string
          max_capacity_per_slot?: number
          min_advance_hours?: number
          privacy_policy_text?: string | null
          slot_interval?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          generate_meet_link?: boolean
          google_calendar_sync_mode?: string
          id?: string
          max_capacity_per_slot?: number
          min_advance_hours?: number
          privacy_policy_text?: string | null
          slot_interval?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          accepted_at: string
          client_name: string
          client_phone: string
          company_id: string
          consent_type: string
          id: string
          ip_address: string | null
          policy_version: string | null
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          client_name: string
          client_phone: string
          company_id: string
          consent_type?: string
          id?: string
          ip_address?: string | null
          policy_version?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          client_name?: string
          client_phone?: string
          company_id?: string
          consent_type?: string
          id?: string
          ip_address?: string | null
          policy_version?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          company_id: string
          connected_email: string | null
          created_at: string
          id: string
          refresh_token: string
          staff_id: string | null
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          company_id: string
          connected_email?: string | null
          created_at?: string
          id?: string
          refresh_token: string
          staff_id?: string | null
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          company_id?: string
          connected_email?: string | null
          created_at?: string
          id?: string
          refresh_token?: string
          staff_id?: string | null
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_tokens_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          template: string
          type: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          template: string
          type: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          template?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          minutes_before: number
          type: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          minutes_before?: number
          type: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          minutes_before?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          cta_subtitle: string | null
          cta_text: string | null
          footer_text: string | null
          hero_subtitle: string | null
          hero_title: string | null
          hero_title_highlight: string | null
          id: string
          logo_url: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          cta_subtitle?: string | null
          cta_text?: string | null
          footer_text?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hero_title_highlight?: string | null
          id?: string
          logo_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          cta_subtitle?: string | null
          cta_text?: string | null
          footer_text?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hero_title_highlight?: string | null
          id?: string
          logo_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      public_page_settings: {
        Row: {
          background_color: string | null
          banner_url: string | null
          button_style: string | null
          cancellation_policy: string | null
          company_id: string
          created_at: string
          font_style: string | null
          id: string
          primary_color: string | null
          secondary_color: string | null
          show_address: boolean | null
          show_map: boolean | null
          show_services_cards: boolean | null
          subtitle: string | null
          title: string | null
          welcome_message: string | null
        }
        Insert: {
          background_color?: string | null
          banner_url?: string | null
          button_style?: string | null
          cancellation_policy?: string | null
          company_id: string
          created_at?: string
          font_style?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          show_address?: boolean | null
          show_map?: boolean | null
          show_services_cards?: boolean | null
          subtitle?: string | null
          title?: string | null
          welcome_message?: string | null
        }
        Update: {
          background_color?: string | null
          banner_url?: string | null
          button_style?: string | null
          cancellation_policy?: string | null
          company_id?: string
          created_at?: string
          font_style?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          show_address?: boolean | null
          show_map?: boolean | null
          show_services_cards?: boolean | null
          subtitle?: string | null
          title?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_page_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          anamnesis_type_id: string | null
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          duration: number
          id: string
          image_url: string | null
          name: string
          price: number | null
          requires_anamnesis: boolean
          requires_sessions: boolean
        }
        Insert: {
          active?: boolean
          anamnesis_type_id?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          image_url?: string | null
          name: string
          price?: number | null
          requires_anamnesis?: boolean
          requires_sessions?: boolean
        }
        Update: {
          active?: boolean
          anamnesis_type_id?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          image_url?: string | null
          name?: string
          price?: number | null
          requires_anamnesis?: boolean
          requires_sessions?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_anamnesis_type_id_fkey"
            columns: ["anamnesis_type_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_packages: {
        Row: {
          client_name: string
          client_phone: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          service_id: string | null
          status: string
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          client_name: string
          client_phone: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          client_name?: string
          client_phone?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_packages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          appointment_id: string | null
          company_id: string
          created_at: string
          evolution: string | null
          id: string
          notes: string | null
          package_id: string
          session_date: string
          session_number: number
          status: string
        }
        Insert: {
          appointment_id?: string | null
          company_id: string
          created_at?: string
          evolution?: string | null
          id?: string
          notes?: string | null
          package_id: string
          session_date?: string
          session_number?: number
          status?: string
        }
        Update: {
          appointment_id?: string | null
          company_id?: string
          created_at?: string
          evolution?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          session_date?: string
          session_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "session_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          invite_status: string
          invite_token: string | null
          name: string
          photo_url: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          invite_status?: string
          invite_token?: string | null
          name: string
          photo_url?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          invite_status?: string
          invite_token?: string | null
          name?: string
          photo_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          id?: string
          service_id: string
          staff_id: string
        }
        Update: {
          id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          status: string
          trial_end: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          status?: string
          trial_end?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          status?: string
          trial_end?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          block_date: string
          company_id: string
          created_at: string
          end_time: string | null
          id: string
          reason: string | null
          staff_id: string | null
          start_time: string | null
        }
        Insert: {
          block_date: string
          company_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          reason?: string | null
          staff_id?: string | null
          start_time?: string | null
        }
        Update: {
          block_date?: string
          company_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          reason?: string | null
          staff_id?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_agent_logs: {
        Row: {
          action: string
          company_id: string
          conversation_id: string | null
          created_at: string
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          company_id: string
          conversation_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agent_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_agent_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_agent_settings: {
        Row: {
          cancellation_policy_hours: number | null
          company_id: string
          created_at: string
          elevenlabs_api_key: string | null
          elevenlabs_voice_id: string | null
          enabled: boolean
          greeting_message: string | null
          handoff_after_failures: number | null
          id: string
          max_reschedule_suggestions: number | null
          openai_api_key: string | null
          respond_audio_with_audio: boolean | null
          updated_at: string
        }
        Insert: {
          cancellation_policy_hours?: number | null
          company_id: string
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_voice_id?: string | null
          enabled?: boolean
          greeting_message?: string | null
          handoff_after_failures?: number | null
          id?: string
          max_reschedule_suggestions?: number | null
          openai_api_key?: string | null
          respond_audio_with_audio?: boolean | null
          updated_at?: string
        }
        Update: {
          cancellation_policy_hours?: number | null
          company_id?: string
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_voice_id?: string | null
          enabled?: boolean
          greeting_message?: string | null
          handoff_after_failures?: number | null
          id?: string
          max_reschedule_suggestions?: number | null
          openai_api_key?: string | null
          respond_audio_with_audio?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agent_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          client_name: string | null
          company_id: string
          created_at: string
          current_appointment_id: string | null
          current_intent: string | null
          handoff_requested: boolean | null
          id: string
          last_message_at: string | null
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          company_id: string
          created_at?: string
          current_appointment_id?: string | null
          current_intent?: string | null
          handoff_requested?: boolean | null
          id?: string
          last_message_at?: string | null
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          company_id?: string
          created_at?: string
          current_appointment_id?: string | null
          current_intent?: string | null
          handoff_requested?: boolean | null
          id?: string
          last_message_at?: string | null
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_current_appointment_id_fkey"
            columns: ["current_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_knowledge_base: {
        Row: {
          active: boolean
          category: string
          company_id: string
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          company_id: string
          content: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_knowledge_base_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          appointment_id: string | null
          company_id: string
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          phone: string
          status: string
          type: string
        }
        Insert: {
          appointment_id?: string | null
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          phone: string
          status?: string
          type: string
        }
        Update: {
          appointment_id?: string | null
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          phone?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          company_id: string
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_type: string
          metadata: Json | null
        }
        Insert: {
          company_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
        }
        Update: {
          company_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          active: boolean
          base_url: string | null
          company_id: string
          created_at: string
          from_number: string | null
          id: string
          instance_id: string | null
          token: string | null
        }
        Insert: {
          active?: boolean
          base_url?: string | null
          company_id: string
          created_at?: string
          from_number?: string | null
          id?: string
          instance_id?: string | null
          token?: string | null
        }
        Update: {
          active?: boolean
          base_url?: string | null
          company_id?: string
          created_at?: string
          from_number?: string | null
          id?: string
          instance_id?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
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
      app_role: ["super_admin", "admin", "user"],
    },
  },
} as const
