import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import EduTrackLogo from "@/components/EduTrackLogo"

export default function Signup() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [role, setRole] = useState<"student" | "professor">("student")
  const [department, setDepartment] = useState("")
  const [year, setYear] = useState("")
  const [section, setSection] = useState("")
  const [accessKey, setAccessKey] = useState("")
  const [showAccessKey, setShowAccessKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleRoleChange = (newRole: "student" | "professor") => {
    setRole(newRole)
    if (newRole === "professor") {
      setDepartment("")
      setYear("")
      setSection("")
      setRegistrationNumber("")
    } else {
      setAccessKey("")
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName || !email || !password || !confirmPassword) {
      toast.error("Please fill in all required fields")
      return
    }

    if (role === "student") {
      const normReg = registrationNumber.trim().toUpperCase()
      if (!normReg) {
        toast.error("Registration number is required.")
        return
      }

      const emailPrefix = email.includes("@") ? email.split("@")[0].trim().toUpperCase() : ""
      if (!emailPrefix || normReg !== emailPrefix) {
        toast.error("Registration number does not match your college email.")
        return
      }

      if (!year) {
        toast.error("Please select your year of study")
        return
      }

      // Check if registration number already exists in database
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "student")
        .ilike("student_id", normReg)
        .maybeSingle()

      if (existingProfile) {
        toast.error("An account with this registration number already exists.")
        return
      }
    }

    if (role === "professor" && (!accessKey || !accessKey.trim())) {
      toast.error("Professor access key is required.")
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
      if (role === "professor") {
        // Professor Signup via Server-Side Edge Function / Secure Backend
        let funcRes = await supabase.functions.invoke("register-professor", {
          body: {
            fullName,
            email,
            password,
            accessKey: accessKey.trim(),
          },
        })

        let responseData = funcRes.data
        let responseError = funcRes.error

        if (responseError) {
          let errMsg = ""
          if (responseError.context && typeof responseError.context.json === "function") {
            try {
              const errJson = await responseError.context.json()
              errMsg = errJson?.error || errJson?.message
            } catch (_) { }
          }

          const status = responseError.status || responseError.context?.status

          if (status === 403 || errMsg?.includes("Invalid professor access key")) {
            toast.error("Invalid professor access key. Please contact the administrator.")
            setLoading(false)
            return
          }
          if (status === 429 || errMsg?.includes("Too many failed attempts")) {
            toast.error("Too many failed attempts. Please try again later.")
            setLoading(false)
            return
          }
          if (status === 400 && errMsg?.includes("required")) {
            toast.error("Professor access key is required.")
            setLoading(false)
            return
          }

          // Fallback call to express server endpoint if local Deno edge function CLI is not running
          try {
            const backendRes = await fetch("/api/register-professor", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fullName, email, password, accessKey: accessKey.trim() })
            })
            const backendData = await backendRes.json().catch(() => ({}))
            if (backendRes.ok && backendData.success) {
              responseData = backendData
              responseError = null
            } else {
              const bStatus = backendRes.status
              const bMsg = backendData.error || ""
              if (bStatus === 403 || bMsg.includes("Invalid professor access key")) {
                toast.error("Invalid professor access key. Please contact the administrator.")
              } else if (bStatus === 429 || bMsg.includes("Too many failed attempts")) {
                toast.error("Too many failed attempts. Please try again later.")
              } else if (bStatus === 400 && bMsg.includes("required")) {
                toast.error("Professor access key is required.")
              } else {
                toast.error(bMsg || "Unable to verify professor access key. Please try again.")
              }
              setLoading(false)
              return
            }
          } catch (fallbackErr) {
            toast.error(errMsg || "Unable to verify professor access key. Please try again.")
            setLoading(false)
            return
          }
        }

        if (responseData?.success || responseData?.user) {
          // Log in automatically after registration
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password
          })

          if (!signInErr && signInData.session) {
            toast.success("Account created successfully!")
            navigate("/professor/dashboard", { replace: true })
          } else {
            toast.success("Professor account created successfully! Please log in.")
            navigate("/login", { replace: true })
          }
        } else {
          toast.error(responseData?.error || "Unable to verify professor access key. Please try again.")
        }
      } else {
        // Standard Student Signup
        const normReg = registrationNumber.trim().toUpperCase()
        const userMetadata: Record<string, any> = {
          full_name: fullName,
          role: "student",
          student_id: normReg,
        }
        if (department) userMetadata.department = department
        if (year) userMetadata.year = parseInt(year)
        if (section) userMetadata.section = section

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: userMetadata
          }
        })

        if (error) {
          if (error.message?.toLowerCase().includes("unique") || error.message?.toLowerCase().includes("already exists") || error.message?.includes("23505")) {
            toast.error("An account with this registration number already exists.")
          } else {
            toast.error(error.message)
          }
          return
        }

        if (data.user) {
          // Safe explicit upsert to profiles table referencing auth user UUID
          const { error: upsertError } = await supabase.from("profiles").upsert({
            auth_user_id: data.user.id,
            email: email,
            full_name: fullName,
            role: "student",
            student_id: normReg,
            department: department || null,
            year: year ? parseInt(year) : null,
            section: section || null,
          }, { onConflict: "auth_user_id" })

          if (upsertError) {
            if (upsertError.message?.toLowerCase().includes("unique") || upsertError.message?.toLowerCase().includes("already exists") || upsertError.code === "23505") {
              toast.error("An account with this registration number already exists.")
              return
            }
          }

          if (data.session) {
            toast.success("Account created successfully!")
            navigate("/student/dashboard", { replace: true })
          } else {
            toast.success("Account created! Please check your email or log in.")
            navigate("/login", { replace: true })
          }
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

            {role === "professor" && (
              <div className="space-y-2 animate-in fade-in duration-300">
                <label className="text-sm font-medium leading-none" htmlFor="accessKey">
                  Professor Access Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    id="accessKey"
                    type={showAccessKey ? "text" : "password"}
                    placeholder="Enter professor access key"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    disabled={loading}
                    className="h-12 bg-slate-50 border-none rounded-2xl pr-12 focus-visible:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessKey(!showAccessKey)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showAccessKey ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {role === "student" && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="registrationNumber">
                    Registration Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="registrationNumber"
                    type="text"
                    placeholder="Enter Reg No"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    disabled={loading}
                    className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition font-mono"
                  />
                </div>

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
              {loading ? (
                role === "professor" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Creating professor account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Creating account...
                  </span>
                )
              ) : (
                "Create Account"
              )}
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
