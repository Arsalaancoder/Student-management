import { supabase } from "@/lib/supabase"
import type { Database } from "@/types/database.types"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]

export interface UserProfileResponse {
  profile: Profile | null
  user: any
  error: any
}

/**
 * Single reusable function to retrieve the authenticated user's EduTrack profile.
 * Performs UUID-based lookup against `public.profiles` using `auth_user_id` or `id`.
 * Contains auto-repair fallback if a valid Auth user row exists without a profile.
 */
export const getCurrentUserProfile = async (passedUserId?: string): Promise<UserProfileResponse> => {
  try {
    let userId = passedUserId
    let authUser: any = null

    if (!userId) {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !sessionData.session?.user) {
        return { profile: null, user: null, error: sessionErr }
      }
      authUser = sessionData.session.user
      userId = authUser.id
    }

    if (!userId) {
      return { profile: null, user: null, error: null }
    }

    // Query profiles table by auth_user_id or id
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle()

    if (import.meta.env.DEV) {
      console.log("--- AUTH & PROFILE DEBUG ---")
      console.log("AUTH USER ID:", userId)
      console.log("AUTH EMAIL:", authUser?.email || "N/A")
      console.log("PROFILE QUERY RESULT:", profile)
      console.log("PROFILE QUERY ERROR:", profileErr)
      console.log("-----------------------------")
    }

    if (profileErr) {
      console.error("getCurrentUserProfile database query error:", profileErr)
      return { profile: null, user: authUser, error: profileErr }
    }

    // If Auth user exists but profile row was missing, perform safe auto-repair
    if (!profile) {
      if (!authUser) {
        const { data: userData } = await supabase.auth.getUser()
        authUser = userData?.user ?? null
      }

      if (authUser) {
        const meta = authUser.user_metadata || {}
        const fallbackRole = (meta.role === "professor") ? "professor" : "student"
        
        const { data: repairedProfile, error: repairErr } = await supabase
          .from("profiles")
          .upsert({
            auth_user_id: userId,
            email: authUser.email,
            full_name: meta.full_name || authUser.email?.split('@')[0] || "EduTrack User",
            role: fallbackRole,
            department: fallbackRole === "student" ? (meta.department || null) : null,
            year: fallbackRole === "student" ? (meta.year ? parseInt(meta.year) : null) : null,
            section: fallbackRole === "student" ? (meta.section || null) : null,
          }, { onConflict: "auth_user_id" })
          .select()
          .single()

        if (!repairErr && repairedProfile) {
          console.log("Auto-repaired missing profile for user:", userId)
          return { profile: repairedProfile, user: authUser, error: null }
        } else {
          console.error("Auto-repair failed for user:", userId, repairErr)
        }
      }
    }

    return { profile: profile || null, user: authUser, error: null }
  } catch (err) {
    console.error("getCurrentUserProfile exception:", err)
    return { profile: null, user: null, error: err }
  }
}
