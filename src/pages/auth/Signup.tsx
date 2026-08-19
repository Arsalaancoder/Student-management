import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import EduTrackLogo from "@/components/EduTrackLogo"

export default function Signup() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [role, setRole] = useState<"student" | "professor">("student")
  const [department, setDepartment] = useState("")
  const [year, setYear] = useState("")
  const [section, setSection] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleRoleChange = (newRole: "student" | "professor") => {
    setRole(newRole)
    if (newRole === "professor") {
      setDepartment("")
      setYear("")
      setSection("")
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName || !email || !password || !confirmPassword) {
      toast.error("Please fill in all required fields")
      return
    }

    if (role === "student" && !year) {
      toast.error("Please select your year of study")
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
      const userMetadata: Record<string, any> = {
        full_name: fullName,
        role: role,
      }
      if (role === "student") {
        if (department) userMetadata.department = department
        if (year) userMetadata.year = parseInt(year)
        if (section) userMetadata.section = section
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userMetadata
        }
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        // Safe explicit upsert to profiles table referencing auth user UUID
        await supabase.from("profiles").upsert({
          auth_user_id: data.user.id,
          email: email,
          full_name: fullName,
          role: role,
          department: role === "student" ? (department || null) : null,
          year: role === "student" ? (year ? parseInt(year) : null) : null,
          section: role === "student" ? (section || null) : null,
        }, { onConflict: "auth_user_id" })

        if (data.session) {
          toast.success("Account created successfully!")
          navigate(`/${role}/dashboard`, { replace: true })
        } else {
          toast.success("Account created! Please check your email or log in.")
          navigate("/login", { replace: true })
        }
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
      <div className="mb-8 space-y-4">
        <EduTrackLogo size="lg" className="mb-2" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Create an account</h2>
          <p className="text-muted-foreground">Join the academic portal today</p>
        </div>
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
                    onChange={() => handleRoleChange("student")}
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
                    onChange={() => handleRoleChange("professor")}
                    disabled={loading}
                  />
                  <span className="text-sm font-medium">Professor</span>
                </label>
              </div>
            </div>

            {role === "student" && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="department">
                    Branch / Department
                  </label>
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={loading}
                    className="w-full h-12 px-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-900"
                  >
                    <option value="">Select Branch</option>
                    <option value="Computer Science & Engineering">Computer Science & Engineering (CSE)</option>
                    <option value="Information Technology">Information Technology (IT)</option>
                    <option value="Electronics & Communication">Electronics & Communication (ECE)</option>
                    <option value="Electrical & Electronics">Electrical & Electronics (EEE)</option>
                    <option value="Mechanical Engineering">Mechanical Engineering (MECH)</option>
                    <option value="Civil Engineering">Civil Engineering (CIVIL)</option>
                    <option value="AI & ML">Artificial Intelligence & Machine Learning (AI&ML)</option>
                    <option value="Data Science">Artificial Intelligence & Data Science (AI&DS)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="year">
                      Year *
                    </label>
                    <select
                      id="year"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      disabled={loading}
                      className="w-full h-12 px-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-900"
                    >
                      <option value="">Select Year</option>
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="section">
                      Section / Group
                    </label>
                    <select
                      id="section"
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      disabled={loading}
                      className="w-full h-12 px-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-900"
                    >
                      <option value="">Select Section</option>
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                      <option value="D">Section D</option>
                      <option value="E">Section E</option>
                      <option value="F">Section F</option>
                    </select>
                  </div>
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
                  placeholder="password"
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
                  placeholder="confirm password"
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
