import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Fingerprint, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { isWebAuthnSupported, loginWithPasskey } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error("Please enter both email and password")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        if (error.message.includes("Email not confirmed")) {
          toast.error("Please verify your email address before logging in.")
        } else if (error.message.includes("Invalid login credentials")) {
          toast.error("Invalid email or password.")
        } else {
          toast.error(error.message)
        }
        return
      }

      if (data.session) {
        toast.success("Successfully logged in!")
        // The AuthLayout or AuthContext listener will automatically redirect the user
        // based on their profile role once it's fetched, but we can safely just
        // let the state listener handle the routing.
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred. Please try again.")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    if (!isWebAuthnSupported) {
      toast.error("Passkey authentication is not available on this device.")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await loginWithPasskey()
      
      if (error) {
        toast.error("Passkey login failed or was cancelled.")
        console.error("Passkey error:", error)
        return
      }

      if (data?.session) {
        toast.success("Successfully logged in with Passkey!")
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred. Please try again.")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Welcome back</h2>
        <p className="text-muted-foreground">Sign in to your account to continue</p>
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
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Sign In"}
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
