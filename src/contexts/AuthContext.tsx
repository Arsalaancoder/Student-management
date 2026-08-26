// @ts-nocheck
import { createContext, useContext, useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { getCurrentUserProfile, type Profile } from "@/lib/auth"

export interface LoginResult {
  success: boolean
  user?: User
  profile?: Profile
  role?: string
  missingProfile?: boolean
  error?: any
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileError: boolean
  isPasswordRecovery: boolean
  isWebAuthnSupported: boolean
  loginWithEmail: (email: string, password: string) => Promise<LoginResult>
  signOut: () => Promise<void>
  registerPasskey: () => Promise<any>
  loginWithPasskey: (email?: string) => Promise<any>
  refreshProfile: () => Promise<void>
  clearPasswordRecoveryState: () => void
}

const isWebAuthnSupported = typeof window !== 'undefined' && window.PublicKeyCredential !== undefined;

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileError: false,
  isPasswordRecovery: false,
  isWebAuthnSupported,
  loginWithEmail: async () => ({ success: false }),
  signOut: async () => {},
  registerPasskey: async () => {},
  loginWithPasskey: async () => {},
  refreshProfile: async () => {},
  clearPasswordRecoveryState: () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash
      const search = window.location.search
      const pathname = window.location.pathname
      return hash.includes("type=recovery") || search.includes("type=recovery") || pathname === "/reset-password"
    }
    return false
  })

  const loadUserProfile = async (userId: string) => {
    setProfileError(false)
    const res = await getCurrentUserProfile(userId)
    if (res.profile) {
      setProfile(res.profile)
      setProfileError(false)
    } else {
      setProfile(null)
      setProfileError(true)
    }
    setLoading(false)
    return res.profile
  }

  useEffect(() => {
    // Check initial session on app mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadUserProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // Listen for authentication changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true)
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false)
      }

      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadUserProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loginWithEmail = async (email: string, password: string): Promise<LoginResult> => {
    setLoading(true)
    setProfileError(false)
    try {
      // 1. Authenticate with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setLoading(false)
        return { success: false, error: authError }
      }

      if (!data.session || !data.user) {
        setLoading(false)
        return { success: false, error: new Error("Authentication failed. No valid session returned.") }
      }

      // 2. Query Profile using reusable getCurrentUserProfile function
      const res = await getCurrentUserProfile(data.user.id)

      if (!res.profile) {
        console.error("Missing profile for authenticated user:", {
          userId: data.user.id,
          email: data.user.email,
          error: res.error
        })
        setProfileError(true)
        setLoading(false)
        return { 
          success: false, 
          missingProfile: true, 
          error: new Error("Your account was authenticated, but your profile could not be found. Please contact support.") 
        }
      }

      // 3. Validate Role
      if (!res.profile.role || (res.profile.role !== 'student' && res.profile.role !== 'professor')) {
        setLoading(false)
        return {
          success: false,
          error: new Error("Your account does not have a valid EduTrack role.")
        }
      }

      // Update State
      setSession(data.session)
      setUser(data.user)
      setProfile(res.profile)
      setProfileError(false)
      setLoading(false)

      return {
        success: true,
        user: data.user,
        profile: res.profile,
        role: res.profile.role
      }
    } catch (err: any) {
      setLoading(false)
      return { success: false, error: err }
    }
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await loadUserProfile(user.id)
    }
  }

  const clearPasswordRecoveryState = () => {
    setIsPasswordRecovery(false)
  }

  const signOut = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setIsPasswordRecovery(false)
      setSession(null)
      setUser(null)
      setProfile(null)
      setProfileError(false)
      setLoading(false)
    }
  }

  const registerPasskey = async () => {
    try {
      if (typeof (supabase.auth as any).registerPasskey === 'function') {
        const res = await (supabase.auth as any).registerPasskey()
        if (!res.error) return res
        console.warn("registerPasskey returned error, trying MFA enroll fallback:", res.error)
      }
      return await supabase.auth.mfa.enroll({
        factorType: 'webauthn',
        friendlyName: 'EduTrack Passkey'
      })
    } catch (err: any) {
      return { data: null, error: err }
    }
  }

  const loginWithPasskey = async (email?: string) => {
    try {
      if (typeof (supabase.auth as any).signInWithPasskey === 'function') {
        const options = email ? { email } : undefined
        return await (supabase.auth as any).signInWithPasskey(options)
      }
      return { data: null, error: new Error("Passkey login is not supported by your browser.") }
    } catch (err: any) {
      return { data: null, error: err }
    }
  }

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      profile, 
      loading, 
      profileError, 
      isPasswordRecovery,
      isWebAuthnSupported, 
      loginWithEmail, 
      signOut, 
      registerPasskey, 
      loginWithPasskey, 
      refreshProfile,
      clearPasswordRecoveryState
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}


