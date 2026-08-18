import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

export default function Signup() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [role, setRole] = useState<"student" | "professor">("student")
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!fullName || !email || !password || !confirmPassword) {
      toast.error("Please fill in all fields")
      return
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          }
        }
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user && data.session) {
        toast.success("Account created successfully!")
      } else if (data.user && !data.session) {
        toast.success("Account created! Please check your email to verify your account.")
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
        <h2 className="text-3xl font-bold tracking-tight mb-2">Create an account</h2>
        <p className="text-muted-foreground">Join the academic portal today</p>
      </div>

      <Card className="border-none shadow-lg">
        <form onSubmit={handleSignup}>
          <CardContent className="pt-6 space-y-4">
            
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="fullName">
                Full Name
              </label>
                <Input 
                  id="fullName" 
                  type="text" 
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
                />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Role
              </label>
              <div className="flex gap-4 pt-1">
                <label className={`flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer hover:border-primary ${role === 'student' ? 'border-primary bg-primary/5' : ''}`}>
                  <input 
                    type="radio" 
                    name="role" 
                    value="student" 
                    className="text-primary focus:ring-primary" 
                    checked={role === "student"}
                    onChange={(e) => setRole(e.target.value as "student")}
                    disabled={loading}
                  />
                  <span className="text-sm font-medium">Student</span>
                </label>
                <label className={`flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer hover:border-primary ${role === 'professor' ? 'border-primary bg-primary/5' : ''}`}>
                  <input 
                    type="radio" 
                    name="role" 
                    value="professor" 
                    className="text-primary focus:ring-primary"
                    checked={role === "professor"}
                    onChange={(e) => setRole(e.target.value as "professor")}
                    disabled={loading}
                  />
                  <span className="text-sm font-medium">Professor</span>
                </label>
              </div>
            </div>
            
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
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="password">
                  Password
                </label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <Button type="submit" className="w-full text-base py-6 mt-4 rounded-2xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Create Account"}
            </Button>
            
          </CardContent>
        </form>
        <CardFooter className="flex justify-center border-t p-6">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
