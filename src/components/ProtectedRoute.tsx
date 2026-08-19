import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2, AlertCircle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import EduTrackLogo from "@/components/EduTrackLogo"

interface ProtectedRouteProps {
  allowedRole?: "student" | "professor"
}

export default function ProtectedRoute({ allowedRole }: ProtectedRouteProps) {
  const { session, profile, loading, profileError, signOut } = useAuth()

  // 1. Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F4F7FE]">
        <EduTrackLogo size="lg" />
        <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold mt-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#1E5EFF]" />
          <span>Loading your dashboard...</span>
        </div>
      </div>
    )
  }

  // 2. Unauthenticated user
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // 3. Authenticated session exists, but profile is missing or failed to load
  if (!profile || profileError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F4F7FE] text-center">
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl max-w-md w-full space-y-6">
          <EduTrackLogo size="lg" className="mx-auto" />
          <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#0B1E43]">Profile Loading Error</h2>
            <p className="text-sm text-slate-500">
              Your account profile could not be loaded. Please sign in again or contact support.
            </p>
          </div>
          <Button 
            onClick={() => {
              signOut()
              window.location.href = "/login"
            }} 
            className="w-full rounded-2xl bg-[#1E5EFF] py-6 text-sm font-bold shadow-md hover:shadow-lg transition-all"
          >
            <LogOut className="mr-2 h-4 w-4" /> Return to Login
          </Button>
        </div>
      </div>
    )
  }

  // 4. Role Authorization check
  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={`/${profile.role}/dashboard`} replace />
  }

  return <Outlet />
}

