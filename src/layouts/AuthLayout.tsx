import { Outlet, Navigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import EduTrackLogo from "@/components/EduTrackLogo"

export default function AuthLayout() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F4F7FE]">
        <EduTrackLogo size="lg" />
        <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mt-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // If already logged in and we know their role, redirect to dashboard
  if (session && profile) {
    return <Navigate to={`/${profile.role}/dashboard`} replace />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F0F4F8] md:p-8 lg:p-12 relative">
      <div className="flex-1 flex w-full max-w-6xl mx-auto bg-white md:rounded-[2.5rem] shadow-2xl overflow-hidden relative">
        
        {/* Left Branding Section - Clinicaly Style */}
        <div className="hidden md:flex flex-1 flex-col bg-primary relative p-12 justify-center overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-accent/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-400/20 rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute bottom-10 left-10 w-32 h-32 bg-yellow-400/20 rounded-full" />
          
          <div className="relative z-10 text-white flex flex-col justify-between h-full">
            <div>
              <div className="mb-6 bg-white/95 p-3.5 rounded-2xl inline-block shadow-md">
                <EduTrackLogo size="xl" />
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-2">
                The Next Generation
              </h1>
              <h2 className="text-2xl text-cyan-200 font-semibold mb-4">
                Of Academic Management
              </h2>
            </div>

            {/* Book Lover SVG Illustration */}
            <div className="my-6 w-full flex items-center justify-center">
              <img 
                src="/book-lover-pana.svg" 
                alt="Book Lover Illustration" 
                className="w-full max-h-80 object-contain filter drop-shadow-2xl animate-in zoom-in-95 duration-700" 
              />
            </div>

            <p className="text-white/90 text-sm lg:text-base max-w-md leading-relaxed">
              Manage assignments, track academic progress, receive automated feedback, and discover educational resources, all in one place.
            </p>
          </div>
        </div>

        {/* Right Form Section */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16 bg-white relative z-10">
          <div className="w-full max-w-md">
            <div className="md:hidden flex items-center justify-center mb-8">
              <EduTrackLogo size="lg" />
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
