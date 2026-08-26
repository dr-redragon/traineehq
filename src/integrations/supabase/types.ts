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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          deanery_id: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialty_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          training_grade: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deanery_id?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          training_grade?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deanery_id?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          training_grade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          deanery_id: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          deanery_id?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          deanery_id?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          id: string
          marked_by: string | null
          notes: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "teaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          user_id?: string | null
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived: boolean | null
          category: Database["public"]["Enums"]["contact_category"]
          created_at: string
          deanery_id: string | null
          email: string
          id: string
          name: string
          organisation: string
          phone: string | null
          profile_url: string | null
          role: string
          specialty_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean | null
          category: Database["public"]["Enums"]["contact_category"]
          created_at?: string
          deanery_id?: string | null
          email: string
          id?: string
          name: string
          organisation: string
          phone?: string | null
          profile_url?: string | null
          role: string
          specialty_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean | null
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string
          deanery_id?: string | null
          email?: string
          id?: string
          name?: string
          organisation?: string
          phone?: string | null
          profile_url?: string | null
          role?: string
          specialty_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_preferences: {
        Row: {
          columns: number
          created_at: string
          hidden_widgets: Json
          id: string
          right_column_widgets: Json
          updated_at: string
          user_id: string
          widget_layout: Json
          widget_settings: Json
        }
        Insert: {
          columns?: number
          created_at?: string
          hidden_widgets?: Json
          id?: string
          right_column_widgets?: Json
          updated_at?: string
          user_id: string
          widget_layout?: Json
          widget_settings?: Json
        }
        Update: {
          columns?: number
          created_at?: string
          hidden_widgets?: Json
          id?: string
          right_column_widgets?: Json
          updated_at?: string
          user_id?: string
          widget_layout?: Json
          widget_settings?: Json
        }
        Relationships: []
      }
      deaneries: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          short_name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          short_name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          short_name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      discussion_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          discussion_id: string
          id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          discussion_id: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          discussion_id?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_comments_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "discussion_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_votes: {
        Row: {
          comment_id: string | null
          created_at: string
          discussion_id: string | null
          id: string
          user_id: string
          vote_type: number
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          discussion_id?: string | null
          id?: string
          user_id: string
          vote_type: number
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          discussion_id?: string | null
          id?: string
          user_id?: string
          vote_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "discussion_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "discussion_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_votes_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean | null
          specialty_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          specialty_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          specialty_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussions_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      facilitator_specialties: {
        Row: {
          created_at: string
          id: string
          specialty_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          specialty_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          specialty_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilitator_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deanery_id: string | null
          email: string | null
          first_name: string | null
          gdpr_consent_at: string | null
          id: string
          last_name: string | null
          specialty_id: string | null
          training_grade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deanery_id?: string | null
          email?: string | null
          first_name?: string | null
          gdpr_consent_at?: string | null
          id?: string
          last_name?: string | null
          specialty_id?: string | null
          training_grade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deanery_id?: string | null
          email?: string | null
          first_name?: string | null
          gdpr_consent_at?: string | null
          id?: string
          last_name?: string | null
          specialty_id?: string | null
          training_grade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_specialty"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
          subheading: string | null
          subsection_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
          subheading?: string | null
          subsection_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
          subheading?: string | null
          subsection_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_folders_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          added_by: string | null
          created_at: string
          description: string | null
          embed_url: string | null
          external_url: string | null
          file_size: number | null
          file_url: string | null
          folder_id: string | null
          id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          sort_order: number | null
          subheading: string | null
          subsection_id: string
          title: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          embed_url?: string | null
          external_url?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          sort_order?: number | null
          subheading?: string | null
          subsection_id: string
          title: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          embed_url?: string | null
          external_url?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          sort_order?: number | null
          subheading?: string | null
          subsection_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "resource_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      specialties: {
        Row: {
          color: string | null
          created_at: string
          deanery_id: string
          deleted_at: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          name: string
          parent_specialty_id: string | null
          short_name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deanery_id?: string
          deleted_at?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_specialty_id?: string | null
          short_name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deanery_id?: string
          deleted_at?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_specialty_id?: string | null
          short_name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialties_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialties_parent_specialty_id_fkey"
            columns: ["parent_specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      specialty_notices: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          specialty_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          specialty_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          specialty_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialty_notices_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      starred_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "starred_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      subsections: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
          specialty_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
          specialty_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
          specialty_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsections_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          deanery_id: string | null
          id: string
          location: string | null
          notes: string | null
          session_date: string
          specialty_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deanery_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          session_date: string
          specialty_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deanery_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          session_date?: string
          specialty_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_sessions_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_sessions_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      trainee_specialties: {
        Row: {
          created_at: string
          id: string
          specialty_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          specialty_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          specialty_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainee_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          deanery_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          deanery_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          deanery_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_deanery_id_fkey"
            columns: ["deanery_id"]
            isOneToOne: false
            referencedRelation: "deaneries"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_discussions: {
        Row: {
          created_at: string
          discussion_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_discussions_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_specialty: {
        Args: { _specialty_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_resource: {
        Args: { _subsection_id: string; _user_id: string }
        Returns: boolean
      }
      get_profile_display_names: {
        Args: never
        Returns: {
          first_name: string
          last_name: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_facilitator_for: {
        Args: { _specialty_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "trainee" | "facilitator" | "super_admin"
      attendance_status: "present" | "absent" | "late" | "excused"
      contact_category:
        | "deanery"
        | "tpd"
        | "associate_dean"
        | "educational_supervisor"
        | "trainee_rep"
        | "royal_college"
        | "trust_lead"
        | "rota_admin"
      request_status: "pending" | "approved" | "rejected"
      resource_type:
        | "pdf"
        | "document"
        | "video"
        | "link"
        | "presentation"
        | "checklist"
        | "folder"
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
      app_role: ["admin", "trainee", "facilitator", "super_admin"],
      attendance_status: ["present", "absent", "late", "excused"],
      contact_category: [
        "deanery",
        "tpd",
        "associate_dean",
        "educational_supervisor",
        "trainee_rep",
        "royal_college",
        "trust_lead",
        "rota_admin",
      ],
      request_status: ["pending", "approved", "rejected"],
      resource_type: [
        "pdf",
        "document",
        "video",
        "link",
        "presentation",
        "checklist",
        "folder",
      ],
    },
  },
} as const
