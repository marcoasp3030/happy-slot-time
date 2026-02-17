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
      appointments: {
        Row: {
          appointment_date: string
          client_name: string
          client_phone: string
          company_id: string
          created_at: string
          end_time: string
          id: string
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
          id?: string
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
          id?: string
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
      companies: {
        Row: {
          address: string | null
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
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          max_capacity_per_slot: number
          min_advance_hours: number
          slot_interval: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          max_capacity_per_slot?: number
          min_advance_hours?: number
          slot_interval?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          max_capacity_per_slot?: number
          min_advance_hours?: number
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
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          duration: number
          id: string
          name: string
          price: number | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          name: string
          price?: number | null
        }
        Update: {
          active?: boolean
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          name?: string
          price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          name: string
          photo_url: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          photo_url?: string | null
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
