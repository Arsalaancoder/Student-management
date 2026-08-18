import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2 } from "lucide-react"

interface ProtectedRouteProps {
  allowedRole?: "student" | "professor"
}

export default function ProtectedRoute({ allowedRole }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not authenticated
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Authenticated, but checking role authorization
  if (allowedRole && profile && profile.role !== allowedRole) {
    // Redirect to their respective dashboard if they try to access the wrong one
    return <Navigate to={`/${profile.role}/dashboard`} replace />
  }

  return <Outlet />
}
