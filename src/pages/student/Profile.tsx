// @ts-nocheck
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Loader2, 
  User, 
  Mail, 
  Building, 
  Hash, 
  Calendar, 
  Layers, 
  ShieldCheck, 
  Camera, 
  Fingerprint, 
  Plus, 
  Trash2, 
  Upload,
  Edit3,
  X,
  Check,
  AlertTriangle
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function StudentProfile() {
  const { user, profile, refreshProfile, registerPasskey, isWebAuthnSupported, signOut } = useAuth()
  const navigate = useNavigate()
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(false)
  
  const [formData, setFormData] = useState({
    full_name: "",
    student_id: "",
    department: "",
    year: "",
    section: ""
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        student_id: profile.student_id || "",
        department: profile.department || "",
        year: profile.year?.toString() || "",
        section: profile.section || ""
      })
    }
  }, [profile])

  const fetchPasskeys = async () => {
    try {
      setLoadingPasskeys(true)
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const webAuthnFactors = data?.all?.filter(f => f.factor_type === 'webauthn') || []
      setPasskeys(webAuthnFactors)
    } catch (error) {
      console.error("Error fetching passkeys:", error)
    } finally {
      setLoadingPasskeys(false)
    }
  }

  useEffect(() => {
    fetchPasskeys()
  }, [])

  const handleAddPasskey = async () => {
    try {
      setSaving(true)
      const res = await registerPasskey()

      if (res?.error) {
        const err = res.error
        const errorMsg = err.message || ""
        if (err.name === 'NotAllowedError' || errorMsg.includes('cancelled') || errorMsg.includes('abort')) {
          toast.info("Passkey registration was cancelled.")
        } else if (errorMsg.toLowerCase().includes("disabled") || errorMsg.toLowerCase().includes("webauthn")) {
          toast.error("Passkey authentication is currently disabled in your Supabase Auth settings. Please sign in using your email & password.")
        } else if (errorMsg.includes("verification") || errorMsg.includes("failed")) {
          toast.error("Credential verification failed. Please check that Windows Hello / Touch ID is set up on your device.")
        } else {
          toast.error(errorMsg || "Failed to register passkey.")
        }
        return
      }

      toast.success("Passkey registered successfully!")
      await fetchPasskeys()
    } catch (error: any) {
      console.error("Passkey registration failed:", error)
      if (error?.name === 'NotAllowedError' || error?.message?.includes('cancelled')) {
        toast.info("Passkey registration was cancelled.")
      } else {
        toast.error(error?.message || "Failed to register passkey.")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePasskey = async (factorId: string) => {
    try {
      setSaving(true)
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      toast.success("Passkey removed successfully!")
      fetchPasskeys()
    } catch (error: any) {
      console.error("Failed to remove passkey:", error)
      toast.error(error.message || "Failed to remove passkey.")
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCancel = () => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        student_id: profile.student_id || "",
        department: profile.department || "",
        year: profile.year?.toString() || "",
        section: profile.section || ""
      })
    }
    setIsEditing(false)
  }

  const handlePhotoSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input value so re-selecting same file triggers onChange
    e.target.value = ""

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    const isTypeValid = validTypes.includes(file.type.toLowerCase())
    
    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    const isSizeValid = file.size <= 5 * 1024 * 1024

    if (!isTypeValid || !isSizeValid) {
      toast.error("Please select a JPG, PNG, or WEBP image under 5 MB.")
      return
    }

    // Show preview
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setUploading(true)

    try {
      const userId = user?.id || profile?.auth_user_id
      if (!userId) {
        throw new Error("User authentication ID not found")
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filePath = `${userId}/profile.${fileExt}`

      // Upload file to Supabase Storage in avatars bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) throw uploadError

      // Generate signed URL (10 years) for private bucket access
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from('avatars')
        .createSignedUrl(filePath, 315360000)

      let finalPhotoUrl = ""
      if (!signedUrlError && signedData?.signedUrl) {
        // Append timestamp cache buster
        finalPhotoUrl = `${signedData.signedUrl}&t=${Date.now()}`
      } else {
        // Fallback to getPublicUrl
        const { data: publicData } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath)
        finalPhotoUrl = `${publicData.publicUrl}?t=${Date.now()}`
      }

      // Update profile record in database
      const profileId = profile?.id
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          profile_photo_url: finalPhotoUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", profileId)

      if (updateError) throw updateError

      // Refresh context profile state immediately
      await refreshProfile()
      toast.success("Photo updated successfully.")
    } catch (error: any) {
      console.error("Error uploading photo:", error)
      toast.error("Unable to upload profile photo. Please try again.")
      setPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    try {
      setSaving(true)
      
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          student_id: formData.student_id,
          department: formData.department,
          year: formData.year ? parseInt(formData.year) : null,
          section: formData.section,
          updated_at: new Date().toISOString()
        })
        .eq("id", profile.id)

      if (error) throw error
      
      await refreshProfile()
      toast.success("Profile updated successfully.")
      setIsEditing(false)
    } catch (error: any) {
      console.error("Error updating profile:", error)
      toast.error(error.message || "Unable to update your profile.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== "DELETE") {
      toast.error("Please type DELETE exactly to confirm account deletion.")
      return
    }

    try {
      setIsDeletingAccount(true)
      const { data, error } = await supabase.functions.invoke("delete-account")

      if (error || data?.error) {
        const errorMsg = error?.message || data?.error || "Unable to delete your account. No changes were made."
        toast.error(errorMsg)
        setIsDeletingAccount(false)
        return
      }

      toast.success("Your account has been permanently deleted.")
      setShowDeleteModal(false)

      await signOut()
      localStorage.clear()
      sessionStorage.clear()

      navigate("/login", { replace: true })
    } catch (err: any) {
      console.error("Delete account exception:", err)
      toast.error(err.message || "Unable to delete your account. No changes were made.")
      setIsDeletingAccount(false)
    }
  }

  if (!profile) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const avatarSrc = previewUrl || profile.profile_photo_url || ""

  const formatYearDisplay = (yr: number | string | null | undefined) => {
    if (!yr) return "Not set"
    const val = yr.toString().trim()
    if (val === "1") return "1st Year"
    if (val === "2") return "2nd Year"
    if (val === "3") return "3rd Year"
    if (val === "4") return "4th Year"
    if (val.toLowerCase().includes("year")) return val
    return `${val}th Year`
  }

  const formatSectionDisplay = (sec: string | null | undefined) => {
    if (!sec) return "Not set"
    const val = sec.trim()
    if (val.toLowerCase().startsWith("section")) return val
    return `Section ${val}`
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-5xl mx-auto">
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your academic identity and personal information.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: NEW Profile Summary Card (Read-Only Display) */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
            <CardHeader className="p-6 pb-4 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-[#0B1E43] flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Profile Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-4 space-y-6">
              
              {/* Profile Photo & Name Header */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-3 group cursor-pointer" onClick={handlePhotoSelect}>
                  <Avatar className="h-28 w-28 border-4 border-slate-100 shadow-md">
                    <AvatarImage src={avatarSrc} key={avatarSrc} alt="Profile photo" />
                    <AvatarFallback className="bg-primary/10 text-primary text-3xl font-bold uppercase">
                      {profile.full_name ? profile.full_name.charAt(0) : "S"}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Upload Overlay on Hover */}
                  <div className={`absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {uploading ? (
                      <>
                        <Loader2 className="h-6 w-6 text-white animate-spin mb-1" />
                        <span className="text-[10px] text-white font-medium">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-white mb-1" />
                        <span className="text-[10px] text-white font-medium">Change</span>
                      </>
                    )}
                  </div>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handlePhotoSelect}
                  disabled={uploading}
                  className="rounded-full font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 gap-2 text-xs mb-3"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-primary" />}
                  {uploading ? "Uploading..." : "Upload Photo"}
                </Button>

                <h2 className="text-xl font-bold text-[#0B1E43] capitalize">{profile.full_name || "Student"}</h2>
                <p className="text-muted-foreground font-medium uppercase tracking-wider text-xs mt-0.5">
                  {profile.role || "Student"} Account
                </p>
              </div>

              {/* Profile Details List (Read-Only) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                
                {/* 1. Full Name */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Full Name</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate">{profile.full_name || "Not set"}</p>
                  </div>
                </div>

                {/* 2. Student ID */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Student ID</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate">{profile.student_id || "Not set"}</p>
                  </div>
                </div>

                {/* 3. College Email */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">College Email</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate break-all">{profile.email || user?.email || "Not set"}</p>
                  </div>
                </div>

                {/* 4. Branch / Department */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <Building className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Branch / Department</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate">{profile.department || "Not set"}</p>
                  </div>
                </div>

                {/* 5. Year */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Year</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate">{formatYearDisplay(profile.year)}</p>
                  </div>
                </div>

                {/* 6. Section */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Section</p>
                    <p className="text-sm font-bold text-[#0B1E43] truncate">{formatSectionDisplay(profile.section)}</p>
                  </div>
                </div>

              </div>

              {passkeys.length > 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-xs font-bold w-full border border-green-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Device Auth Enabled
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-xs font-bold w-full border border-slate-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Standard Login
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        {/* Right Column: EXISTING PROFILE FORM & Security Settings */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem]">
            <CardHeader className="p-8 pb-4 border-b border-muted/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                Personal Information
              </CardTitle>
              
              {!isEditing && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                  className="rounded-full text-xs font-bold gap-2 border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit Profile
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Non-editable Email field */}
                <div className="grid gap-6 md:grid-cols-2 p-6 bg-slate-50 rounded-2xl border border-slate-100 mb-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" /> Email Address
                    </label>
                    <div className="font-semibold text-slate-700">{profile.email}</div>
                    <p className="text-[10px] text-muted-foreground">Managed by Supabase Auth</p>
                  </div>
                </div>

                {/* Editable / Display fields */}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <label htmlFor="full_name" className="text-sm font-bold text-[#0B1E43] block mb-2">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="full_name" 
                        name="full_name"
                        value={formData.full_name} 
                        onChange={handleChange}
                        disabled={!isEditing}
                        className={`pl-11 h-12 rounded-2xl focus-visible:ring-primary/20 ${isEditing ? 'bg-[#F4F7FE] border-none' : 'bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed'}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label htmlFor="student_id" className="text-sm font-bold text-[#0B1E43] block mb-2">Student ID</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="student_id" 
                        name="student_id"
                        value={formData.student_id} 
                        onChange={handleChange}
                        disabled={!isEditing}
                        placeholder="e.g. CS2023001"
                        className={`pl-11 h-12 rounded-2xl focus-visible:ring-primary/20 ${isEditing ? 'bg-[#F4F7FE] border-none' : 'bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed'}`}
                      />
                    </div>
                  </div>

                  {/* Branch / Department */}
                  <div className="space-y-3 md:col-span-2">
                    <label htmlFor="department" className="text-sm font-bold text-[#0B1E43] block mb-2">Branch / Department</label>
                    <div className="relative">
                      <Building className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      {isEditing ? (
                        <select
                          id="department"
                          name="department"
                          value={formData.department}
                          onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                          className="pl-11 h-12 rounded-2xl bg-[#F4F7FE] border-none w-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
                        >
                          <option value="">Select Branch</option>
                          <option value="Computer Science & Engineering">Computer Science & Engineering (CSE)</option>
                          <option value="Information Technology">Information Technology (IT)</option>
                          <option value="Electronics & Communication">Electronics & Communication (ECE)</option>
                          <option value="Electrical & Electronics">Electrical & Electronics (EEE)</option>
                          <option value="Mechanical Engineering">Mechanical Engineering (MECH)</option>
                          <option value="Civil Engineering">Civil Engineering (CIVIL)</option>
                          <option value="AI & DS">Artificial Intelligence & Data Science (AI & DS)</option>
                          <option value="Data Science">Data Science</option>
                        </select>
                      ) : (
                        <Input 
                          id="department" 
                          name="department"
                          value={formData.department || "Not set"} 
                          disabled
                          className="pl-11 h-12 rounded-2xl bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed font-semibold"
                        />
                      )}
                    </div>
                  </div>

                  {/* Year */}
                  <div className="space-y-3">
                    <label htmlFor="year" className="text-sm font-bold text-[#0B1E43] block mb-2">Year</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      {isEditing ? (
                        <select
                          id="year" 
                          name="year"
                          value={formData.year} 
                          onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                          className="pl-11 h-12 rounded-2xl bg-[#F4F7FE] border-none w-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
                        >
                          <option value="">Select Year</option>
                          <option value="1">1st Year</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                        </select>
                      ) : (
                        <Input 
                          id="year" 
                          name="year"
                          value={formData.year ? `${formData.year}${formData.year === '1' ? 'st' : formData.year === '2' ? 'nd' : formData.year === '3' ? 'rd' : 'th'} Year` : "Not set"} 
                          disabled
                          className="pl-11 h-12 rounded-2xl bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed font-semibold"
                        />
                      )}
                    </div>
                  </div>

                  {/* Section */}
                  <div className="space-y-3">
                    <label htmlFor="section" className="text-sm font-bold text-[#0B1E43] block mb-2">Section</label>
                    <div className="relative">
                      <Layers className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      {isEditing ? (
                        <select
                          id="section" 
                          name="section"
                          value={formData.section} 
                          onChange={(e) => setFormData(prev => ({ ...prev, section: e.target.value }))}
                          className="pl-11 h-12 rounded-2xl bg-[#F4F7FE] border-none w-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
                        >
                          <option value="">Select Section</option>
                          <option value="A">Section A</option>
                          <option value="B">Section B</option>
                          <option value="C">Section C</option>
                          <option value="D">Section D</option>
                          <option value="E">Section E</option>
                          <option value="F">Section F</option>
                        </select>
                      ) : (
                        <Input 
                          id="section" 
                          name="section"
                          value={formData.section ? `Section ${formData.section}` : "Not set"} 
                          disabled
                          className="pl-11 h-12 rounded-2xl bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed font-semibold"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                {isEditing && (
                  <div className="pt-6 border-t border-muted/50 flex justify-end gap-3">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleCancel}
                      disabled={saving}
                      className="rounded-full px-6 h-12 text-sm font-bold border-slate-200 text-slate-700 hover:bg-slate-100 gap-2"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={saving} 
                      className="rounded-full px-8 h-12 text-sm font-bold gap-2"
                    >
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Check className="h-4 w-4" /> Save Changes</>}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Security Settings Card */}
          <Card className="border-none shadow-sm rounded-[2rem]">
            <CardHeader className="p-8 pb-4 border-b border-muted/50">
              <CardTitle className="text-xl flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-muted-foreground" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-[#0B1E43]">Passkeys / Device Biometrics</h3>
                <p className="text-sm text-muted-foreground">
                  Sign in securely without a password using your device's fingerprint, face scan, or screen lock.
                </p>

                {isWebAuthnSupported ? (
                  <div className="space-y-4 pt-2">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <h4 className="font-bold text-sm text-[#0B1E43] uppercase tracking-wider mb-4">Registered Devices</h4>
                      
                      {loadingPasskeys ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading devices...
                        </div>
                      ) : passkeys.length === 0 ? (
                        <p className="text-sm text-slate-500 py-2">No passkeys registered yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {passkeys.map(key => (
                            <div key={key.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <Fingerprint className="h-5 w-5 text-primary" />
                                <div>
                                  <p className="font-bold text-sm text-[#0B1E43]">{key.friendly_name || "Device Passkey"}</p>
                                  <p className="text-xs text-muted-foreground">Added on {new Date(key.created_at).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleRemovePasskey(key.id)}
                                disabled={saving}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={handleAddPasskey}
                      disabled={saving}
                      variant="outline" 
                      className="w-full sm:w-auto font-bold border-primary text-primary hover:bg-primary/5"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Passkey
                    </Button>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-100 text-orange-800 p-4 rounded-xl text-sm font-medium">
                    Passkey authentication is not available on this device or browser.
                  </div>
                )}
              </div>

            </CardContent>
          </Card>

          {/* Danger Zone Card */}
          <Card className="border border-red-200 shadow-sm rounded-[2rem] bg-red-50/30">
            <CardHeader className="p-8 pb-4 border-b border-red-100">
              <CardTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-4">
              <h3 className="text-base font-bold text-[#0B1E43]">Delete Account</h3>
              <p className="text-sm text-muted-foreground">
                Permanently delete your EduTrack student account and all associated account data. This action is irreversible.
              </p>
              <div className="pt-2">
                <Button
                  onClick={() => {
                    setDeleteConfirmText("")
                    setShowDeleteModal(true)
                  }}
                  variant="destructive"
                  className="rounded-full px-6 font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Delete Account Modal Dialog */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-2xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-[#0B1E43]">Delete your account?</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              This permanently deletes your EduTrack account and associated account data. This action cannot be undone.
            </p>

            <div className="space-y-2 pt-2">
              <label htmlFor="student-delete-confirm" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Type <span className="text-red-600 font-extrabold">DELETE</span> to confirm
              </label>
              <Input
                id="student-delete-confirm"
                type="text"
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={isDeletingAccount}
                className="h-12 bg-slate-50 border-slate-200 rounded-2xl focus-visible:ring-red-500/20 font-bold"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="rounded-full px-5 h-11 border-slate-200 font-semibold hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.trim() !== "DELETE" || isDeletingAccount}
                className="rounded-full px-6 h-11 font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete My Account"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
