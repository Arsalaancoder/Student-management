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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          created_at: string
          created_by: string | null
          deadline: string
          description: string | null
          id: string
          instructions: string | null
          allowed_file_types: string[] | null
          rubric: Json | null
          max_credits: number | null
          max_marks: number | null
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline: string
          description?: string | null
          id?: string
          instructions?: string | null
          allowed_file_types?: string[] | null
          rubric?: Json | null
          max_credits?: number | null
          max_marks?: number | null
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline?: string
          description?: string | null
          id?: string
          instructions?: string | null
          allowed_file_types?: string[] | null
          rubric?: Json | null
          max_credits?: number | null
          max_marks?: number | null
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          created_at: string
          credits: number
          id: string
          reason: string | null
          student_id: string | null
          submission_id: string | null
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          reason?: string | null
          student_id?: string | null
          submission_id?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          reason?: string | null
          student_id?: string | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          id: string
          student_id: string | null
          subject_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          student_id?: string | null
          subject_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          credits: number | null
          feedback: string | null
          graded_at: string
          id: string
          marks: number | null
          professor_id: string | null
          submission_id: string | null
          rubric_scores: Json | null
          is_draft: boolean | null
        }
        Insert: {
          credits?: number | null
          feedback?: string | null
          graded_at?: string
          id?: string
          marks?: number | null
          professor_id?: string | null
          submission_id?: string | null
          rubric_scores?: Json | null
          is_draft?: boolean | null
        }
        Update: {
          credits?: number | null
          feedback?: string | null
          graded_at?: string
          id?: string
          marks?: number | null
          professor_id?: string | null
          submission_id?: string | null
          rubric_scores?: Json | null
          is_draft?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plagiarism_reports: {
        Row: {
          created_at: string
          id: string
          report_data: Json | null
          similarity_percentage: number
          status: string | null
          submission_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          report_data?: Json | null
          similarity_percentage: number
          status?: string | null
          submission_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          report_data?: Json | null
          similarity_percentage?: number
          status?: string | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plagiarism_reports_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          profile_photo_url: string | null
          role: Database["public"]["Enums"]["user_role"]
          section: string | null
          student_id: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          profile_photo_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          section?: string | null
          student_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          profile_photo_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          section?: string | null
          student_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          professor_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          professor_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          professor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_versions: {
        Row: {
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          submission_id: string | null
          submitted_at: string
          version_number: number
        }
        Insert: {
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          submission_id?: string | null
          submitted_at?: string
          version_number: number
        }
        Update: {
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          submission_id?: string | null
          submitted_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_versions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string | null
          created_at: string
          current_version: number | null
          id: string
          return_reason: string | null
          similarity_score: number | null
          status: string | null
          student_id: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          current_version?: number | null
          id?: string
          return_reason?: string | null
          similarity_score?: number | null
          status?: string | null
          student_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          current_version?: number | null
          id?: string
          return_reason?: string | null
          similarity_score?: number | null
          status?: string | null
          student_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
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
      user_profile_id: { Args: never; Returns: string }
      grade_submission: {
        Args: {
          p_submission_id: string
          p_professor_id: string
          p_status: string
          p_marks?: number | null
          p_credits?: number | null
          p_feedback?: string | null
          p_return_reason?: string | null
          p_rubric_scores?: Json | null
          p_is_draft?: boolean | null
        }
        Returns: undefined
      }
    }
    Enums: {
      user_role: "student" | "professor"
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
      user_role: ["student", "professor"],
    },
  },
} as const
