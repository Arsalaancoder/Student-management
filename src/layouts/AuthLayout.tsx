import { Outlet, Navigate } from "react-router-dom"
import { BookOpen, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

export default function AuthLayout() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // If already logged in and we know their role, redirect to dashboard
  if (session && profile) {
    return <Navigate to={`/${profile.role}/dashboard`} replace />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F0F4F8] md:p-8 lg:p-12">
      <div className="flex-1 flex w-full max-w-6xl mx-auto bg-white md:rounded-[2.5rem] shadow-2xl overflow-hidden relative">
        
        {/* Left Branding Section - Clinicaly Style */}
        <div className="hidden md:flex flex-1 flex-col bg-primary relative p-12 justify-center overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-accent/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-400/20 rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute bottom-10 left-10 w-32 h-32 bg-yellow-400/20 rounded-full" />
          
          <div className="relative z-10 text-white">
            <div className="flex items-center gap-3 font-bold text-xl mb-12">
              <div className="bg-white text-primary p-2 rounded-lg">
                <BookOpen className="h-6 w-6" />
              </div>
              <span>Smart Academic</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
              The Next <br/>Generation
            </h1>
            <h2 className="text-3xl text-cyan-200 font-semibold mb-6">
              Of Academic Management
            </h2>
            <p className="text-white/80 text-lg max-w-md leading-relaxed">
              Our portal lets you manage assignments, track academic progress, get automated feedback, and discover educational resources, all in one place.
            </p>
          </div>
        </div>

        {/* Right Form Section */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16 bg-white relative z-10">
          <div className="w-full max-w-md">
            <div className="md:hidden flex items-center justify-center gap-3 font-bold text-xl mb-8 text-primary">
              <div className="bg-primary/10 text-primary p-2 rounded-lg">
                <BookOpen className="h-6 w-6" />
              </div>
              <span>Smart Academic</span>
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
