// @ts-nocheck
import { useState, useEffect, useRef } from "react"
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
  ShieldCheck, 
  Camera, 
  Fingerprint, 
  Plus, 
  Trash2, 
  Upload,
  Edit3,
  X,
  Check
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function ProfessorProfile() {
  const { user, profile, refreshProfile, registerPasskey, isWebAuthnSupported } = useAuth()
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(false)
  
  const [formData, setFormData] = useState({
    full_name: "",
    department: "",
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        department: profile.department || "",
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
      const { data, error } = await supabase.auth.mfa.unenroll({ factorId })
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
        department: profile.department || "",
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
          department: formData.department,
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

  if (!profile) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const avatarSrc = previewUrl || profile.profile_photo_url || ""

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-4xl mx-auto">
      
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
        <p className="text-muted-foreground mt-1">Manage your academic identity and security settings.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        
        {/* Left Column: Identity Card */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-[#1E5EFF] to-[#4DB8FF]" />
            <CardContent className="px-8 pb-8 pt-0 flex flex-col items-center text-center">
              
              {/* Profile Photo Avatar */}
              <div className="relative -mt-16 mb-4 group cursor-pointer" onClick={handlePhotoSelect}>
                <Avatar className="h-32 w-32 border-4 border-white shadow-md">
                  <AvatarImage src={avatarSrc} key={avatarSrc} alt="Profile photo" />
                  <AvatarFallback className="bg-primary/10 text-primary text-3xl font-bold uppercase">
                    {profile.full_name ? profile.full_name.charAt(0) : "P"}
                  </AvatarFallback>
                </Avatar>

                {/* Uploading Overlay or Hover Camera */}
                <div className={`absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {uploading ? (
                    <>
                      <Loader2 className="h-7 w-7 text-white animate-spin mb-1" />
                      <span className="text-[10px] text-white font-medium">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-7 w-7 text-white mb-1" />
                      <span className="text-[10px] text-white font-medium">Change</span>
                    </>
                  )}
                </div>
              </div>

              {/* Upload Photo Button */}
              <div className="mb-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handlePhotoSelect}
                  disabled={uploading}
                  className="rounded-full font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 gap-2 text-xs"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-primary" />}
                  {uploading ? "Uploading..." : "Upload Photo"}
                </Button>
              </div>

              <h2 className="text-2xl font-bold text-[#0B1E43] capitalize">{profile.full_name}</h2>
              <p className="text-muted-foreground font-medium uppercase tracking-wider text-xs mt-1">
                {profile.role} Account
              </p>

              {passkeys.length > 0 ? (
                <div className="mt-6 flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-bold w-full border border-green-100">
                  <ShieldCheck className="h-4 w-4" />
                  Device Auth Enabled
                </div>
              ) : (
                <div className="mt-6 flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-sm font-bold w-full border border-slate-200">
                  <ShieldCheck className="h-4 w-4" />
                  Standard Login
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        {/* Right Column: Settings Form & Security */}
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

                  <div className="space-y-3 md:col-span-2">
                    <label htmlFor="department" className="text-sm font-bold text-[#0B1E43] block mb-2">Department</label>
                    <div className="relative">
                      <Building className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="department" 
                        name="department"
                        value={formData.department} 
                        onChange={handleChange}
                        disabled={!isEditing}
                        placeholder="e.g. Computer Science"
                        className={`pl-11 h-12 rounded-2xl focus-visible:ring-primary/20 ${isEditing ? 'bg-[#F4F7FE] border-none' : 'bg-slate-50 border-slate-100 text-slate-700 cursor-not-allowed'}`}
                      />
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
        </div>

      </div>
    </div>
  )
}
