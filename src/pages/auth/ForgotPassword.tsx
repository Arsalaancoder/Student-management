import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ArrowLeft, Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

export default function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let timer: any
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [cooldown])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !email.trim()) {
      toast.error("Please enter your registered college email address.")
      return
    }

    if (cooldown > 0) {
      toast.info(`Please wait ${cooldown} seconds before requesting another reset link.`)
      return
    }

    setLoading(true)

    try {
      // Determine redirect URL dynamically based on current origin
      const origin = window.location.origin
      const redirectTo = `${origin}/reset-password`

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })

      if (error) {
        console.error("Supabase resetPasswordForEmail error:", error)
      }

      // Always show generic message to avoid email enumeration
      setSubmitted(true)
      setCooldown(60)
      toast.success("Password reset instructions sent!")
    } catch (err) {
      console.error("Exception during password reset request:", err)
      toast.success("Password reset instructions sent!")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link to="/login" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to login
      </Link>

      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Reset password</h2>
        <p className="text-muted-foreground">Enter your email and we'll send you a link to reset your password</p>
      </div>

      <Card className="border-none shadow-lg">
        <form onSubmit={handleResetPassword}>
          <CardContent className="pt-6 space-y-4">
            {submitted && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 text-blue-900 text-sm">
                <MailCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Check your inbox</p>
                  <p className="text-xs text-blue-700 mt-1">
                    If an account exists with this email address, a password reset link has been sent. Please check your inbox and spam folder.
                  </p>
                </div>
              </div>
            )}

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
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading || cooldown > 0}
              className="w-full h-12 text-base font-semibold rounded-2xl shadow-sm hover:shadow-md transition-all mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : cooldown > 0 ? (
                `Resend available in ${cooldown}s`
              ) : (
                "Send Reset Link"
              )}
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

