import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Fingerprint, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { getCurrentUserProfile } from "@/lib/auth"
import EduTrackLogo from "@/components/EduTrackLogo"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { isWebAuthnSupported, loginWithPasskey, loginWithEmail } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error("Please enter both email and password")
      return
    }

    setLoading(true)
    try {
      const res = await loginWithEmail(email, password)

      if (!res.success) {
        const errMsg = res.error?.message || ""
        if (errMsg.includes("Email not confirmed")) {
          toast.error("Please verify your email address before logging in.")
        } else if (errMsg.includes("Invalid login credentials") || errMsg.includes("invalid_credentials")) {
          toast.error("Invalid email or password.")
        } else if (res.missingProfile) {
          toast.error("Your account was authenticated, but your profile could not be found. Please contact support.")
        } else {
          toast.error(errMsg || "Login failed. Please check your credentials.")
        }
        setLoading(false)
        return
      }

      toast.success("Successfully logged in!")
      
      const targetPath = res.role === "professor" ? "/professor/dashboard" : "/student/dashboard"
      navigate(targetPath, { replace: true })
    } catch (error: any) {
      toast.error("An unexpected error occurred. Please try again.")
      console.error(error)
      setLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    if (!isWebAuthnSupported) {
      toast.error("Passkey authentication is not available on this device or browser.")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await loginWithPasskey()

      if (error) {
        const errorMsg = error.message || ""
        if (error.name === 'NotAllowedError' || errorMsg.includes('cancelled') || errorMsg.includes('abort') || errorMsg.includes('not allowed')) {
          toast.info("Passkey login was cancelled. Please sign in with your email and password.")
        } else if (errorMsg.toLowerCase().includes("disabled") || errorMsg.toLowerCase().includes("webauthn")) {
          toast.error("Passkey authentication is currently disabled in Supabase Auth settings. Please sign in using email & password.")
        } else {
          toast.error(error.message || "No passkey found for this device. Please sign in with your email and password.")
        }
        console.error("Passkey error:", error)
        setLoading(false)
        return
      }

      if (data?.user || data?.session?.user) {
        const loggedInUser = data.user || data.session.user
        const res = await getCurrentUserProfile(loggedInUser.id)
        toast.success("Successfully logged in with Passkey!")
        const targetPath = res.profile?.role === "professor" ? "/professor/dashboard" : "/student/dashboard"
        navigate(targetPath, { replace: true })
      } else {
        toast.error("Passkey authentication did not return user details. Please try again.")
        setLoading(false)
      }
    } catch (error: any) {
      if (error?.name === 'NotAllowedError' || error?.message?.includes('cancelled')) {
        toast.info("Passkey login was cancelled. Please sign in with your email and password.")
      } else {
        toast.error(error?.message || "Passkey login failed. Please sign in using your email and password.")
      }
      console.error("Passkey exception:", error)
      setLoading(false)
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-start">
          <EduTrackLogo size="xl" className="mb-2" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-[#0B1E43] tracking-tight mb-1">Welcome back</h2>
          <p className="text-muted-foreground text-sm font-medium">Sign in to your EduTrack portal to continue</p>
        </div>
      </div>

      {/* Mobile Illustration display */}
      <div className="block md:hidden mb-6 flex justify-center">
        <img 
          src="/book-lover-pana.svg" 
          alt="Book Lover Illustration" 
          className="h-48 w-full object-contain filter drop-shadow-md" 
        />
      </div>

      <Card className="border-none shadow-lg">
        <form onSubmit={handleLogin}>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="email">
                College Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none" htmlFor="password">
                  Password
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
              />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input type="checkbox" id="remember" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
              <label htmlFor="remember" className="text-sm font-medium leading-none">
                Remember me
              </label>
            </div>

            <Button type="submit" className="w-full text-base py-6 mt-4 rounded-2xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading || !isWebAuthnSupported}
              className="w-full text-base py-6 rounded-2xl border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Fingerprint className="h-5 w-5 text-primary" />
              {isWebAuthnSupported ? "Sign in with Passkey" : "Passkey not supported"}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center border-t p-6">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
