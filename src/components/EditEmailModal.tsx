import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Mail, Lock, Eye, EyeOff, X, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface EditEmailModalProps {
  isOpen: boolean
  onClose: () => void
  currentEmail: string
  role: "student" | "professor"
  studentRegNo?: string | null
}

export default function EditEmailModal({
  isOpen,
  onClose,
  currentEmail,
  role,
  studentRegNo
}: EditEmailModalProps) {
  const { profile, refreshProfile } = useAuth()
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [updating, setUpdating] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    if (updating) return
    setNewEmail("")
    setCurrentPassword("")
    setShowPassword(false)
    onClose()
  }

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault()

    const normNewEmail = newEmail.trim().toLowerCase()

    if (!normNewEmail || !currentPassword) {
      toast.error("Please fill in both your new email and current password.")
      return
    }

    if (normNewEmail === currentEmail.trim().toLowerCase()) {
      toast.error("New email must be different from your current email.")
      return
    }

    // Role-specific student validations
    if (role === "student") {
      // 1. College Domain check
      if (!normNewEmail.endsWith("@nbkrist.org")) {
        toast.error("Please use your NBKRIST college email address.")
        return
      }

      // 2. Registration Number prefix check
      const emailPrefix = normNewEmail.split("@")[0].trim().toUpperCase()
      const regNo = (studentRegNo || profile?.student_id || "").trim().toUpperCase()

      if (regNo && emailPrefix !== regNo) {
        toast.error("Email must match your registered student number.")
        return
      }
    }

    setUpdating(true)

    try {
      // 1. Re-authenticate user with current password
      const authEmail = currentEmail.trim()
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: currentPassword
      })

      if (authErr) {
        toast.error("Current password is incorrect.")
        setUpdating(false)
        return
      }

      // 2. Check if another profile record already owns this email
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normNewEmail)
        .neq("auth_user_id", profile?.auth_user_id || "")
        .maybeSingle()

      if (existingProfile) {
        toast.error("An account with this email already exists.")
        setUpdating(false)
        return
      }

      // 3. Initiate Supabase Auth Email Update
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
        email: normNewEmail
      })

      if (updateErr) {
        const errMsg = updateErr.message || ""
        if (
          errMsg.toLowerCase().includes("already") ||
          errMsg.toLowerCase().includes("duplicate") ||
          errMsg.toLowerCase().includes("registered") ||
          updateErr.status === 422
        ) {
          toast.error("An account with this email already exists.")
        } else {
          toast.error(errMsg || "Unable to update email address. Please try again.")
        }
        setUpdating(false)
        return
      }

      // 4. Update profiles table to ensure immediate synchronization
      if (profile?.id) {
        await supabase
          .from("profiles")
          .update({
            email: normNewEmail,
            updated_at: new Date().toISOString()
          })
          .eq("id", profile.id)
      }

      // 5. Provide feedback depending on confirmation setting
      if (updateData.user?.new_email) {
        toast.success("Verification email sent to your new email address. Please verify it to complete the change.")
      } else {
        toast.success("Email updated successfully.")
      }

      await refreshProfile()
      handleClose()
    } catch (err: any) {
      console.error("Error updating email:", err)
      toast.error("An unexpected error occurred while updating your email.")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 border border-slate-100 dark:border-slate-800">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#0B1E43] dark:text-white">Change Email</h3>
              <p className="text-xs text-muted-foreground">Re-authentication required</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={updating}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleUpdateEmail} className="space-y-4">
          
          {/* Current Email Display */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Current Email
            </label>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-100 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 break-all">
              {currentEmail}
            </div>
          </div>

          {/* New Email Input */}
          <div className="space-y-1.5">
            <label htmlFor="newEmail" className="text-xs font-bold text-[#0B1E43] dark:text-slate-200 uppercase tracking-wider flex items-center justify-between">
              <span>New Email <span className="text-red-500">*</span></span>
              {role === "student" && <span className="text-[10px] text-muted-foreground font-normal">Must be @nbkrist.org</span>}
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="newEmail"
                type="email"
                placeholder={role === "student" ? `${(studentRegNo || profile?.student_id || "24KB5A3009").toLowerCase()}@nbkrist.org` : "new.email@domain.com"}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={updating}
                className="pl-11 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
          </div>

          {/* Current Password Input */}
          <div className="space-y-1.5">
            <label htmlFor="currentPassword" className="text-xs font-bold text-[#0B1E43] dark:text-slate-200 uppercase tracking-wider">
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="currentPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={updating}
                className="pl-11 pr-11 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-medium focus-visible:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={updating}
              className="rounded-full px-5 h-11 border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updating || !newEmail.trim() || !currentPassword}
              className="rounded-full px-6 h-11 font-bold shadow-md gap-2"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Updating email...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Update Email
                </>
              )}
            </Button>
          </div>

        </form>
      </div>
    </div>
  )
}
