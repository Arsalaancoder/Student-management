import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2, KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [isValidSession, setIsValidSession] = useState(false)
  const [success, setSuccess] = useState(false)

  const navigate = useNavigate()
  const { signOut, clearPasswordRecoveryState, isPasswordRecovery } = useAuth()

  useEffect(() => {
    // Check initial hash/search params or active session
    const hash = window.location.hash
    const search = window.location.search

    const hasToken = hash.includes("access_token") || 
                     hash.includes("type=recovery") || 
                     search.includes("type=recovery") || 
                     search.includes("code=") ||
                     isPasswordRecovery

    // Listen for PASSWORD_RECOVERY event or check for recovery session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" || session || hasToken) {
        setIsValidSession(true)
      }
      setVerifying(false)
    })

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session || hasToken) {
        setIsValidSession(true)
      }
      setVerifying(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [isPasswordRecovery])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match. Please verify and try again.")
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        console.error("Supabase updateUser error:", error)
        toast.error(error.message || "Failed to update password. Link may be expired.")
        setLoading(false)
        return
      }

      setSuccess(true)
      toast.success("Password updated successfully!")

      // Clear recovery state & sign out user so they log in fresh with new password
      clearPasswordRecoveryState()
      await signOut()

      setTimeout(() => {
        navigate("/login", { replace: true })
      }, 2000)
    } catch (err: any) {
      console.error("Exception in handleUpdatePassword:", err)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Verifying recovery token...</p>
      </div>
    )
  }

  if (!isValidSession && !success) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="border-none shadow-lg">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-[#0B1E43]">Invalid or Expired Link</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              This password reset link is invalid or has expired. Please request a new link to reset your password.
            </p>
            <Button asChild className="w-full h-12 rounded-2xl font-semibold mt-4">
              <Link to="/forgot-password">Request New Reset Link</Link>
            </Button>
          </CardContent>
          <CardFooter className="flex justify-center border-t p-6">
            <Link to="/login" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to login
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Set new password</h2>
        <p className="text-muted-foreground">Please enter a new secure password for your EduTrack account.</p>
      </div>

      <Card className="border-none shadow-lg">
        {success ? (
          <CardContent className="pt-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-[#0B1E43]">Password Reset Complete!</h2>
            <p className="text-sm text-muted-foreground">
              Your password has been changed successfully. Redirecting you to sign in...
            </p>
            <Button asChild className="w-full h-12 rounded-2xl font-semibold mt-2">
              <Link to="/login">Go to Login</Link>
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleUpdatePassword}>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="new-password">
                  New Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password (min. 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    className="pl-11 h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="confirm-password">
                  Confirm New Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    className="pl-11 h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base font-semibold rounded-2xl shadow-sm hover:shadow-md transition-all mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </CardContent>
          </form>
        )}
      </Card>
    </div>
  )
}
