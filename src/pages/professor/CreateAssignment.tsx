// @ts-nocheck
import { useState, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Loader2, ArrowLeft, Save, AlertCircle, Plus, Trash2, CheckCircle2, 
  Upload, FileText, X 
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { createNotificationForTargetGroup } from "@/lib/notifications"
import { triggerAssignmentEmailNotification } from "@/lib/emailNotifications"
import { triggerFCMNotification } from "@/lib/fcm"

interface FormErrors {
  title?: string
  subject_name?: string
  target_branch?: string
  target_year?: string
  target_sections?: string
  description?: string
  deadline?: string
  max_marks?: string
  max_credits?: string
  assignment_file?: string
}

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"]
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export default function CreateAssignment() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Distribution State
  const [distributionType, setDistributionType] = useState<"all" | "specific">("all")
  const [selectedSections, setSelectedSections] = useState<string[]>([])

  // Rubric State
  const [useRubric, setUseRubric] = useState(false)
  const [rubric, setRubric] = useState<{ criteria: string; marks: number }[]>([
    { criteria: "Implementation", marks: 10 }
  ])

  const [formData, setFormData] = useState({
    title: "",
    subject_name: "",
    target_branch: "",
    target_year: "",
    description: "",
    instructions: "",
    deadline: "",
    max_marks: "100",
    max_credits: "0",
    allowed_file_types: ".pdf,.doc,.docx"
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_FILE_TYPES.includes(file.type)) {
      setFormErrors(prev => ({ ...prev, assignment_file: "Only PDF, DOC, and DOCX files are allowed." }))
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setFormErrors(prev => ({ ...prev, assignment_file: "File must be smaller than 50MB." }))
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setSelectedFile(file)
    setFormErrors(prev => ({ ...prev, assignment_file: undefined }))
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleRubricChange = (index: number, field: "criteria" | "marks", value: string | number) => {
    const newRubric = [...rubric]
    newRubric[index] = { ...newRubric[index], [field]: value }
    setRubric(newRubric)
  }

  const addRubricCriteria = () => setRubric([...rubric, { criteria: "", marks: 0 }])
  const removeRubricCriteria = (index: number) => {
    if (rubric.length > 1) setRubric(rubric.filter((_, i) => i !== index))
  }

  const calculatedMaxMarks = useRubric
    ? rubric.reduce((sum, item) => sum + (Number(item.marks) || 0), 0)
    : parseInt(formData.max_marks || "0")

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!formData.title.trim()) {
      errors.title = "Assignment title is required."
    }
    if (!formData.subject_name || !formData.subject_name.trim()) {
      errors.subject_name = "Please enter the subject name."
    }
    if (!formData.description.trim()) {
      errors.description = "A short description is required."
    }
    if (!formData.deadline) {
      errors.deadline = "Deadline is required."
    } else if (new Date(formData.deadline) <= new Date()) {
      errors.deadline = "Deadline must be in the future."
    }
    if (distributionType === "specific" && selectedSections.length === 0) {
      errors.target_sections = "Please select at least one section when Specific Sections is chosen."
    }
    if (!useRubric) {
      const marks = parseInt(formData.max_marks)
      if (isNaN(marks) || marks <= 0) errors.max_marks = "Maximum marks must be greater than 0."
    }
    const credits = parseInt(formData.max_credits)
    if (isNaN(credits) || credits < 0) errors.max_credits = "Credits must be 0 or more."

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) { toast.error("You must be logged in."); return }
    if (!validate()) { toast.error("Please fix the errors before submitting."); return }

    try {
      setSaving(true)
      setUploadProgress(0)

      const trimmedTitle = formData.title.trim()
      const trimmedSubjectName = formData.subject_name.trim()
      const targetBranchStr = formData.target_branch.trim() || null
      const targetYearNum = formData.target_year ? parseInt(formData.target_year) : null
      const isAllSections = distributionType === "all"

      let assignmentFilePath: string | null = null

      // Upload assignment file if provided
      if (selectedFile) {
        const timestamp = Date.now()
        const safeFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const filePath = `${profile.id}/${timestamp}_${safeFileName}`

        setUploadProgress(10)

        const { error: uploadError } = await supabase.storage
          .from("assignments")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
          })

        if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`)

        assignmentFilePath = filePath
        setUploadProgress(70)
      }

      // Parse allowed file types
      const fileTypesArray = formData.allowed_file_types
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0)

      // Create assignment record with manual subject_name and targeting criteria
      const { data: newAssignment, error: insertError } = await supabase
        .from("assignments")
        .insert([{
          title: trimmedTitle,
          subject_name: trimmedSubjectName,
          target_branch: targetBranchStr,
          target_year: targetYearNum,
          all_sections: isAllSections,
          description: formData.description.trim(),
          instructions: formData.instructions.trim() || null,
          deadline: new Date(formData.deadline).toISOString(),
          max_marks: calculatedMaxMarks,
          max_credits: parseInt(formData.max_credits) || 0,
          allowed_file_types: fileTypesArray.length > 0 ? fileTypesArray : null,
          rubric: useRubric ? rubric : null,
          assignment_file_path: assignmentFilePath,
          created_by: profile.id,
        }])
        .select()
        .single()

      if (insertError) {
        if (assignmentFilePath) {
          await supabase.storage.from("assignments").remove([assignmentFilePath]).catch(err => {
            console.warn("Could not clean up orphaned file:", err)
          })
        }
        throw insertError
      }

      // If specific sections chosen, insert into assignment_sections table
      if (!isAllSections && selectedSections.length > 0) {
        const sectionRows = selectedSections.map(sec => ({
          assignment_id: newAssignment.id,
          section: sec
        }))

        const { error: secInsertErr } = await supabase
          .from("assignment_sections")
          .insert(sectionRows)

        if (secInsertErr) {
          console.error("Error inserting assignment_sections:", secInsertErr)
          // Delete created assignment if section mapping fails
          await supabase.from("assignments").delete().eq("id", newAssignment.id)
          throw secInsertErr
        }
      }

      setUploadProgress(100)

      // Notify targeted students (In-app notifications)
      const professorName = profile.full_name || "Professor"
      await createNotificationForTargetGroup(
        targetBranchStr,
        targetYearNum,
        null,
        "New Assignment",
        `${professorName} posted "${trimmedTitle}"`,
        "new_assignment",
        !isAllSections ? selectedSections : null,
        newAssignment.id
      )

      // Automatically send email notifications to eligible registered students
      try {
        toast.info("Assignment created. Email notifications: Sending...")
        const emailResult = await triggerAssignmentEmailNotification(newAssignment.id)
        
        if (emailResult.sent_count > 0 && emailResult.failed_count > 0) {
          toast.success(`Email notifications: ${emailResult.sent_count} sent, ${emailResult.failed_count} failed`)
        } else if (emailResult.sent_count > 0) {
          toast.success(`Email notifications: ${emailResult.sent_count} sent`)
        } else if (emailResult.failed_count > 0) {
          toast.warning(`Email notifications: 0 sent, ${emailResult.failed_count} failed (${emailResult.message})`)
        } else if (emailResult.total_eligible === 0) {
          toast.info("Assignment posted. No eligible students found for selected targeting criteria.")
        } else {
          toast.success("Assignment posted successfully.")
        }
      } catch (emailErr) {
        console.warn("Email notification processing error:", emailErr)
        toast.success("Assignment posted successfully.")
      }

      // Automatically trigger FCM Push Notifications (Phase 9 & 27: Fail-safe, non-blocking)
      try {
        await triggerFCMNotification(newAssignment.id)
      } catch (fcmErr) {
        console.warn("FCM push notification dispatch warning:", fcmErr)
      }

      navigate("/professor/assignments")

    } catch (err: any) {
      console.error("Error creating assignment:", err)
      toast.error(err.message || "Failed to create assignment. Your form data is preserved.")
    } finally {
      setSaving(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-4xl mx-auto">
      
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-muted">
          <Link to="/professor/assignments"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Create Assignment</h1>
          <p className="text-muted-foreground mt-1">Design a new assignment for your students.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <Card className="border-none shadow-sm rounded-[2rem]">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl">Assignment Details</CardTitle>
            <CardDescription>Required fields are marked with *</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">

              {/* Assignment Title */}
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="title" className="text-sm font-bold text-[#0B1E43]">Assignment Title *</label>
                <Input
                  id="title" name="title"
                  placeholder="e.g. Introduction to KNN"
                  value={formData.title} onChange={handleChange}
                  className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 w-full ${formErrors.title ? "ring-2 ring-red-400" : ""}`}
                />
                {formErrors.title && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.title}</p>}
              </div>

              {/* Subject Name (Manual Text Entry) */}
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="subject_name" className="text-sm font-bold text-[#0B1E43]">Subject Name *</label>
                <Input
                  id="subject_name" name="subject_name"
                  placeholder="Enter subject name (e.g. Machine Learning)"
                  value={formData.subject_name} onChange={handleChange}
                  className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 w-full ${formErrors.subject_name ? "ring-2 ring-red-400" : ""}`}
                />
                {formErrors.subject_name && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.subject_name}</p>}
              </div>

              {/* Description */}
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="text-sm font-bold text-[#0B1E43]">Description *</label>
                <textarea
                  id="description" name="description"
                  placeholder="A brief overview of this assignment..."
                  value={formData.description} onChange={handleChange}
                  className={`bg-[#F4F7FE] border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] resize-none w-full p-4 text-sm ${formErrors.description ? "ring-2 ring-red-400" : ""}`}
                />
                {formErrors.description && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.description}</p>}
              </div>

              {/* Deadline */}
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="deadline" className="text-sm font-bold text-[#0B1E43]">Deadline *</label>
                <Input
                  id="deadline" name="deadline" type="datetime-local"
                  value={formData.deadline} onChange={handleChange}
                  className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 w-full ${formErrors.deadline ? "ring-2 ring-red-400" : ""}`}
                />
                {formErrors.deadline && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.deadline}</p>}
              </div>

              {/* Instructions */}
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="instructions" className="text-sm font-bold text-[#0B1E43]">Detailed Instructions</label>
                <textarea
                  id="instructions" name="instructions"
                  placeholder="Provide detailed instructions, requirements, and evaluation criteria..."
                  value={formData.instructions} onChange={handleChange}
                  className="bg-[#F4F7FE] border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[140px] resize-y w-full p-4 text-sm"
                />
              </div>

              {/* Rubric Toggle */}
              <div className="md:col-span-2 space-y-4 pt-4 border-t border-muted/30">
                <div className="flex items-center justify-between bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-indigo-900">Use Grading Rubric</h4>
                      <p className="text-sm text-indigo-700/80 mt-0.5">Define criteria and marks for structured grading.</p>
                    </div>
                  </div>
                  <div
                    className={`w-12 h-6 rounded-full cursor-pointer relative transition-colors ${useRubric ? "bg-indigo-600" : "bg-slate-300"}`}
                    onClick={() => setUseRubric(!useRubric)}
                    role="switch" aria-checked={useRubric} tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && setUseRubric(!useRubric)}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${useRubric ? "left-7" : "left-1"}`} />
                  </div>
                </div>

                {useRubric && (
                  <div className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#0B1E43]">Rubric Criteria</h4>
                      <span className="text-sm font-bold bg-white px-3 py-1 rounded-lg border border-slate-200 text-slate-600">
                        Total: <span className="text-indigo-600">{calculatedMaxMarks}</span> marks
                      </span>
                    </div>
                    <div className="space-y-3">
                      {rubric.map((item, index) => (
                        <div key={index} className="flex gap-3 items-center">
                          <Input
                            value={item.criteria}
                            onChange={e => handleRubricChange(index, "criteria", e.target.value)}
                            placeholder="Criteria Name"
                            className="bg-white"
                          />
                          <Input
                            type="number" min="0" step="0.5"
                            value={item.marks === 0 ? "" : item.marks}
                            onChange={e => handleRubricChange(index, "marks", parseFloat(e.target.value) || 0)}
                            placeholder="Marks"
                            className="bg-white w-24 text-center font-bold"
                          />
                          <Button
                            type="button" variant="ghost" size="icon"
                            onClick={() => removeRubricCriteria(index)}
                            disabled={rubric.length === 1}
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addRubricCriteria} className="mt-4 bg-white hover:bg-slate-100 text-[#0B1E43]">
                      <Plus className="h-4 w-4 mr-2" /> Add Criteria
                    </Button>
                  </div>
                )}
              </div>

              {/* Max Marks */}
              {!useRubric && (
                <div className="space-y-2">
                  <label htmlFor="max_marks" className="text-sm font-bold text-[#0B1E43]">Maximum Marks *</label>
                  <Input
                    id="max_marks" name="max_marks" type="number" min="1"
                    value={formData.max_marks} onChange={handleChange}
                    className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 w-full ${formErrors.max_marks ? "ring-2 ring-red-400" : ""}`}
                  />
                  {formErrors.max_marks && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.max_marks}</p>}
                </div>
              )}

              {/* Max Credits */}
              <div className="space-y-2">
                <label htmlFor="max_credits" className="text-sm font-bold text-[#0B1E43]">Maximum Credits *</label>
                <Input
                  id="max_credits" name="max_credits" type="number" min="0"
                  value={formData.max_credits} onChange={handleChange}
                  className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 w-full ${formErrors.max_credits ? "ring-2 ring-red-400" : ""}`}
                />
                {formErrors.max_credits && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.max_credits}</p>}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Academic credits awarded on approval. Use 0 if not applicable.
                </p>
              </div>

              {/* Assignment File Upload */}
              <div className="space-y-3 md:col-span-2">
                <label className="text-sm font-bold text-[#0B1E43]">Assignment File</label>
                <p className="text-xs text-muted-foreground">Upload a PDF, DOC, or DOCX file (max 50MB).</p>
                
                {selectedFile ? (
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-[#1E5EFF] rounded-xl flex items-center justify-center">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-[#0B1E43]">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    </div>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={removeFile}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                    >
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${formErrors.assignment_file ? "border-red-300" : "border-slate-200"}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="h-12 w-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                      <Upload className="h-6 w-6 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-sm text-[#0B1E43]">Click to upload assignment file</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX up to 50MB</p>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileSelect}
                />

                {formErrors.assignment_file && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />{formErrors.assignment_file}
                  </p>
                )}

                {saving && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-muted-foreground">
                      <span>Uploading file...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1E5EFF] rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ASSIGNMENT DISTRIBUTION */}
              <div className="md:col-span-2 pt-6 border-t border-muted/50 space-y-4">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1E43] uppercase tracking-wider">ASSIGNMENT DISTRIBUTION</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Specify the target Branch, Year, and Section distribution for this assignment.</p>
                  </div>
                  
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Branch */}
                    <div className="space-y-2">
                      <label htmlFor="target_branch" className="text-sm font-bold text-[#0B1E43]">Branch</label>
                      <select
                        id="target_branch"
                        name="target_branch"
                        value={formData.target_branch}
                        onChange={handleChange}
                        className="h-12 bg-white border border-slate-200 rounded-2xl px-4 focus:outline-none focus:ring-2 focus:ring-primary/20 w-full text-sm font-medium text-slate-900"
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

                    {/* Year */}
                    <div className="space-y-2">
                      <label htmlFor="target_year" className="text-sm font-bold text-[#0B1E43]">Year</label>
                      <select
                        id="target_year"
                        name="target_year"
                        value={formData.target_year}
                        onChange={handleChange}
                        className="h-12 bg-white border border-slate-200 rounded-2xl px-4 focus:outline-none focus:ring-2 focus:ring-primary/20 w-full text-sm font-medium text-slate-900"
                      >
                        <option value="">Select Year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>
                  </div>

                  {/* Distribution Radios */}
                  <div className="space-y-3 pt-2">
                    <label className="text-sm font-bold text-[#0B1E43] block">Distribution</label>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                        <input
                          type="radio"
                          name="distributionType"
                          value="all"
                          checked={distributionType === "all"}
                          onChange={() => {
                            setDistributionType("all")
                            setFormErrors(prev => ({ ...prev, target_sections: undefined }))
                          }}
                          className="h-4 w-4 text-[#1E5EFF] focus:ring-primary"
                        />
                        All Sections
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                        <input
                          type="radio"
                          name="distributionType"
                          value="specific"
                          checked={distributionType === "specific"}
                          onChange={() => setDistributionType("specific")}
                          className="h-4 w-4 text-[#1E5EFF] focus:ring-primary"
                        />
                        Specific Sections
                      </label>
                    </div>

                    {distributionType === "all" && (
                      <p className="text-xs text-muted-foreground italic">
                        The assignment applies to every section within the selected Branch + Year.
                      </p>
                    )}

                    {/* Specific Sections Multi-Select Checkboxes */}
                    {distributionType === "specific" && (
                      <div className="space-y-2 pt-2 animate-in fade-in duration-300">
                        <label className="text-xs font-semibold text-slate-600 block">Select Specific Sections *</label>
                        <div className="flex flex-wrap gap-4 pt-1">
                          {["A", "B", "C", "D", "E", "F"].map(sec => (
                            <label key={sec} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${selectedSections.includes(sec) ? "border-[#1E5EFF] bg-blue-50/80 text-[#1E5EFF] font-bold" : "border-slate-200 bg-white text-slate-700"}`}>
                              <input
                                type="checkbox"
                                value={sec}
                                checked={selectedSections.includes(sec)}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  if (checked) {
                                    setSelectedSections(prev => [...prev, sec])
                                  } else {
                                    setSelectedSections(prev => prev.filter(s => s !== sec))
                                  }
                                  if (formErrors.target_sections) {
                                    setFormErrors(prev => ({ ...prev, target_sections: undefined }))
                                  }
                                }}
                                className="h-4 w-4 rounded text-[#1E5EFF] focus:ring-primary"
                              />
                              <span>{sec}</span>
                            </label>
                          ))}
                        </div>
                        {formErrors.target_sections && (
                          <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                            <AlertCircle className="h-3.5 w-3.5" />{formErrors.target_sections}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 flex justify-end gap-4 border-t border-muted/50">
              <Button type="button" variant="ghost" asChild className="rounded-full px-6 h-12 font-bold hover:bg-muted">
                <Link to="/professor/assignments">Cancel</Link>
              </Button>
              <Button
                type="submit" disabled={saving}
                className="rounded-full px-8 h-12 font-bold shadow-sm bg-[#1E5EFF] hover:bg-blue-700"
              >
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {uploadProgress > 0 ? `Uploading ${uploadProgress}%` : "Creating..."}</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Create & Publish Assignment</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
