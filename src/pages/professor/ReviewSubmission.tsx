// @ts-nocheck
import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, CheckCircle, Clock, ExternalLink, ShieldAlert, Sparkles, AlertTriangle, ChevronRight, X, Loader2, Save, Send, AlertCircle, FileText, Download, User, Calculator } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { createNotification } from "@/lib/notifications"

interface ReviewData {
  submissionId: string
  status: string
  submittedAt: string
  similarityScore: number | null
  studentName: string
  studentId: string
  profilePhoto: string | null
  assignmentTitle: string
  assignmentId: string
  maxMarks: number
  maxCredits: number
  fileUrl: string | null
  fileName: string | null
  returnReason: string | null
  plagiarism_report?: any
  assignmentRubric: any[] | null
  is_draft: boolean
}

export default function ReviewSubmission() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ReviewData | null>(null)
  
  const [gradeForm, setGradeForm] = useState({
    marks: "",
    credits: "",
    feedback: "",
    returnReason: "",
    rubricScores: {} as Record<string, number>
  })

  // Mode can be 'review', 'return', 'grade'
  const [mode, setMode] = useState<'review' | 'return' | 'grade'>('review')

  useEffect(() => {
    if (!profile || !id) return

    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch submission details with relations
        const { data: subData, error: subError } = await supabase
          .from("submissions")
          .select(`
            id,
            status,
            submitted_at,
            similarity_score,
            assignment_id,
            return_reason,
            profiles:student_id (
              full_name,
              student_id,
              department,
              year,
              section,
              profile_photo_url
            ),
            assignments (title, max_marks, max_credits, rubric, subject_name, subjects (name)),
            submission_versions (file_url, file_name, version_number)
          `)
          .eq("id", id)
          .single()

        if (subError) throw subError

        // Get the latest version file
        const versions = subData.submission_versions as any[]
        let latestFileUrl = null
        let latestFileName = null
        if (versions && versions.length > 0) {
          // Sort by version_number descending
          versions.sort((a, b) => b.version_number - a.version_number)
          latestFileUrl = versions[0].file_url
          latestFileName = versions[0].file_name
        }

        // Fetch plagiarism report
        const { data: plagiarismData } = await supabase
          .from("plagiarism_reports")
          .select("*")
          .eq("submission_id", id)
          .maybeSingle()

        const p = (subData.profiles as any) || {}
        const studentName = p.full_name || p.email || (p.student_id ? `Student (${p.student_id})` : "Not provided")

        setData({
          submissionId: subData.id,
          status: subData.status || "submitted",
          submittedAt: subData.submitted_at,
          similarityScore: subData.similarity_score,
          studentName,
          studentId: p.student_id || "Not provided",
          department: p.department || "Not provided",
          year: p.year ? `${p.year}${p.year === 1 ? 'st' : p.year === 2 ? 'nd' : p.year === 3 ? 'rd' : 'th'} Year` : "Not provided",
          section: p.section ? `Section ${p.section}` : "Not provided",
          profilePhoto: p.profile_photo_url || null,
          assignmentTitle: (subData.assignments as any)?.title || "Assignment",
          assignmentId: subData.assignment_id || "",
          maxMarks: (subData.assignments as any)?.max_marks || 100,
          maxCredits: (subData.assignments as any)?.max_credits || 0,
          assignmentRubric: (subData.assignments as any)?.rubric || null,
          fileUrl: latestFileUrl,
          fileName: latestFileName,
          returnReason: subData.return_reason,
          plagiarism_report: plagiarismData,
          is_draft: false
        })

        // Fetch existing grade if any
        const { data: gradeData } = await supabase
          .from("grades")
          .select("marks, credits, feedback, is_draft, rubric_scores")
          .eq("submission_id", id)
          .maybeSingle()

        if (gradeData) {
          setData(prev => prev ? { ...prev, is_draft: !!gradeData.is_draft } : prev)
          setGradeForm(prev => ({
            ...prev,
            marks: gradeData.marks?.toString() || "",
            credits: gradeData.credits?.toString() || "",
            feedback: gradeData.feedback || "",
            rubricScores: gradeData.rubric_scores || {}
          }))
        } else {
          // Pre-fill credits with max credits
          setGradeForm(prev => ({ ...prev, credits: ((subData.assignments as any)?.max_credits || 0).toString() }))
        }

      } catch (error) {
        console.error("Error fetching submission for review:", error)
        toast.error("Failed to load submission details")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile, id])

  const handleDownload = async () => {
    if (!data?.fileUrl) return
    try {
      const { data: fileData, error } = await supabase.storage
        .from('submissions')
        .createSignedUrl(data.fileUrl, 60)
        
      if (error) throw error
      if (fileData) {
        window.open(fileData.signedUrl, '_blank')
      }
    } catch (error) {
      console.error("Error downloading file:", error)
      toast.error("Failed to download file")
    }
  }

  const submitAction = async (newStatus: "approved" | "returned" | "graded", isDraft = false) => {
    if (!profile || !data) return

    if (newStatus === "returned" && !gradeForm.returnReason.trim()) {
      toast.error("Please provide a reason for returning the assignment.")
      return
    }

    if (newStatus === "graded" && !gradeForm.marks && (!data.assignmentRubric || data.assignmentRubric.length === 0)) {
      toast.error("Please enter marks to grade.")
      return
    }

    try {
      setSaving(true)

      const marksVal = gradeForm.marks ? parseFloat(gradeForm.marks) : 0
      const creditsVal = gradeForm.credits ? parseFloat(gradeForm.credits) : 0

      if (newStatus === "graded" && marksVal > data.maxMarks) {
        toast.error(`Marks cannot exceed the maximum (${data.maxMarks})`)
        setSaving(false)
        return
      }

      // Execute the grading RPC
      const { error } = await supabase.rpc("grade_submission", {
        p_submission_id: data.submissionId,
        p_professor_id: profile.id,
        p_marks: newStatus === "graded" ? marksVal : null,
        p_credits: newStatus === "graded" ? creditsVal : null,
        p_feedback: newStatus === "graded" ? gradeForm.feedback : null,
        p_status: newStatus,
        p_return_reason: newStatus === "returned" ? gradeForm.returnReason : null,
        p_rubric_scores: newStatus === "graded" ? gradeForm.rubricScores : null,
        p_is_draft: isDraft
      })

      if (error) throw error

      if (!isDraft) {
        let notifTitle = ""
        let notifMessage = ""
        let notifType: any = ""

        if (newStatus === "graded") {
          notifTitle = "Grade Published"
          notifMessage = `Your submission for ${data.assignmentTitle} has been graded: ${marksVal}/${data.maxMarks}.`
          notifType = "grade_published"
        } else if (newStatus === "returned") {
          notifTitle = "Assignment Returned"
          notifMessage = `Your submission for ${data.assignmentTitle} has been returned for corrections.`
          notifType = "assignment_returned"
        } else if (newStatus === "approved") {
          notifTitle = "Assignment Approved"
          notifMessage = `Your submission for ${data.assignmentTitle} has been approved and is ready for grading.`
          notifType = "assignment_approved"
        }

        if (notifTitle) {
          await createNotification(data.studentId, notifTitle, notifMessage, notifType)
        }
      }

      toast.success(isDraft ? "Draft saved successfully!" : `Submission ${newStatus} successfully!`)
      
      // Update local state to reflect changes instead of forcing navigation if just approved
      setData({ ...data, status: newStatus, is_draft: isDraft })
      
      if (newStatus === "returned" || (newStatus === "graded" && !isDraft)) {
        navigate(`/professor/assignments/${data.assignmentId}/submissions`)
      } else if (newStatus === "approved" || isDraft) {
        setMode("grade")
      }

    } catch (error: any) {
      console.error("Error processing submission:", error)
      toast.error(error.message || "Failed to process submission")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <Skeleton className="h-5 w-80 rounded-lg" />
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6 h-[700px]">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-full w-full rounded-[2rem]" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-full w-full rounded-[2rem]" />
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState 
        icon={FileText} 
        title="Submission not found" 
        description="The submission you are looking for does not exist." 
        action={{ label: "Go Back", onClick: () => navigate('/professor/dashboard') }}
      />
    )
  }

  const isGraded = data.status === "graded" && !data.is_draft
  const isDraft = data.is_draft

  const handleRubricScoreChange = (criteria: string, val: string, max: number) => {
    let score = parseFloat(val) || 0
    if (score > max) score = max
    if (score < 0) score = 0
    
    const newScores = { ...gradeForm.rubricScores, [criteria]: score }
    
    // Auto-sum total marks
    const totalMarks = Object.values(newScores).reduce((sum, s) => sum + s, 0)
    
    setGradeForm(prev => ({
      ...prev,
      rubricScores: newScores,
      marks: totalMarks.toString()
    }))
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-muted">
          <Link to={`/professor/assignments/${data.assignmentId}/submissions`}><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Review Submission</h1>
          <p className="text-muted-foreground mt-1">Assignment: <span className="font-semibold text-foreground">{data.assignmentTitle}</span></p>
        </div>
        {isGraded && (
          <div className="ml-auto px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center gap-2 border border-slate-200">
            <CheckCircle className="h-4 w-4" /> Already Graded
          </div>
        )}
        {isDraft && (
          <div className="ml-auto px-4 py-2 bg-yellow-100 text-yellow-700 font-bold rounded-xl flex items-center gap-2 border border-yellow-200">
            <AlertTriangle className="h-4 w-4" /> Grade Draft
          </div>
        )}
        {data.status === "approved" && !isDraft && (
          <div className="ml-auto px-4 py-2 bg-green-100 text-green-700 font-bold rounded-xl flex items-center gap-2 border border-green-200">
            <CheckCircle className="h-4 w-4" /> Approved for Grading
          </div>
        )}
        {data.status === "returned" && (
          <div className="ml-auto px-4 py-2 bg-red-100 text-red-700 font-bold rounded-xl flex items-center gap-2 border border-red-200">
            <AlertTriangle className="h-4 w-4" /> Returned
          </div>
        )}
      </div>

      {/* Split Pane */}
      <div className="grid lg:grid-cols-2 gap-8 flex-1 min-h-0">
        
        {/* Left Pane: Details & File */}
        <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          <Card className="border-none shadow-sm rounded-[2rem] bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
            <CardContent className="p-8">
              <div className="flex items-start sm:items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-white shadow-sm flex items-center justify-center border-4 border-white overflow-hidden shrink-0">
                  {data.profilePhoto ? (
                    <img src={data.profilePhoto} alt={data.studentName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-blue-500">{data.studentName.charAt(0)}</span>
                  )}
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h2 className="text-2xl font-bold text-[#0B1E43] leading-snug">{data.studentName}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 bg-white/80 text-slate-700 text-xs font-bold rounded-lg uppercase tracking-wider shadow-2xs">ID: {data.studentId}</span>
                    <span className="px-2.5 py-1 bg-white/80 text-slate-700 text-xs font-bold rounded-lg shadow-2xs">{data.department}</span>
                    <span className="px-2.5 py-1 bg-white/80 text-slate-700 text-xs font-bold rounded-lg shadow-2xs">{data.year}</span>
                    <span className="px-2.5 py-1 bg-white/80 text-slate-700 text-xs font-bold rounded-lg shadow-2xs">{data.section}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 pt-1">
                    Submitted on {new Date(data.submittedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {data.similarityScore !== null && (
                <div className={`mt-6 p-4 rounded-2xl flex items-start gap-4 ${data.similarityScore > 30 ? 'bg-red-100/50 border border-red-200 text-red-900' : 'bg-green-100/50 border border-green-200 text-green-900'}`}>
                  {data.similarityScore > 30 ? <ShieldAlert className="h-6 w-6 text-red-600 mt-1" /> : <CheckCircle className="h-6 w-6 text-green-600 mt-1" />}
                  <div>
                    <h4 className="font-bold">Plagiarism Report</h4>
                    <p className="text-sm mt-1 opacity-80">
                      Similarity Score: <span className="font-extrabold text-lg">{data.similarityScore}%</span>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Similarity Widget */}
          {data.plagiarism_report && (
            <Card className="border-none shadow-sm rounded-[2rem] bg-indigo-50 border border-indigo-100 mb-6">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-indigo-900 text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-indigo-500" />
                  Similarity Check
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white text-indigo-700 hover:bg-indigo-50"
                  onClick={() => navigate(`/professor/submissions/${id}/similarity`)}
                >
                  Review Similarity
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-1">Overall Similarity</span>
                    <span className={`text-2xl font-black ${data.plagiarism_report.similarity_percentage > 50 ? 'text-red-600' : data.plagiarism_report.similarity_percentage > 20 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {data.plagiarism_report.similarity_percentage}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-1">Risk Level</span>
                    <span className={`text-lg font-black mt-1 ${data.plagiarism_report.report_data?.risk_level === 'High' || data.plagiarism_report.report_data?.risk_level === 'Very High' ? 'text-red-600' : data.plagiarism_report.report_data?.risk_level === 'Moderate' ? 'text-yellow-600' : 'text-green-600'}`}>
                      {data.plagiarism_report.report_data?.risk_level || "Unknown"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submission Details */}
          <Card className="border-none shadow-sm rounded-[2rem] flex-1">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl">Submission File</CardTitle>
              <CardDescription>Download to review the student's work.</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {data.fileUrl ? (
                <div className="p-8 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center">
                  <FileText className="h-16 w-16 text-blue-400 mb-4" />
                  <h3 className="font-bold text-[#0B1E43] text-lg mb-2">{data.fileName || "Student_Submission.pdf"}</h3>
                  <Button onClick={handleDownload} className="rounded-full font-bold shadow-sm mt-4 bg-[#1E5EFF] hover:bg-blue-700">
                    <Download className="mr-2 h-4 w-4" /> Download File securely
                  </Button>
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-muted bg-muted/20 rounded-[2rem] flex flex-col items-center text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground font-medium">No file attached to this submission.</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Right Pane: Review & Grading Actions */}
        <div className="h-full flex flex-col">
          <Card className="border-none shadow-sm rounded-[2rem] flex-1 flex flex-col overflow-hidden">
            
            {(data.status === "submitted" || data.status === "under_review") && mode === 'review' && (
              <>
                <CardHeader className="p-8 pb-4 bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl">Review Decision</CardTitle>
                  <CardDescription>Decide whether to approve this submission for grading or return it for correction.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 flex flex-col justify-center items-center gap-6 h-full bg-slate-50/50">
                  <Button 
                    onClick={() => setMode('return')}
                    className="w-full max-w-sm rounded-2xl h-16 font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-white"
                    variant="outline"
                  >
                    Return for Correction
                  </Button>
                  <span className="text-muted-foreground font-bold">OR</span>
                  <Button 
                    onClick={() => submitAction('approved')}
                    disabled={saving}
                    className="w-full max-w-sm rounded-2xl h-16 font-bold bg-[#1E5EFF] hover:bg-blue-700 shadow-md text-lg"
                  >
                    {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <><CheckCircle className="mr-2 h-5 w-5" /> Approve Submission</>}
                  </Button>
                </CardContent>
              </>
            )}

            {(data.status === "submitted" || data.status === "under_review") && mode === 'return' && (
              <>
                <CardHeader className="p-8 pb-4 bg-red-50 border-b border-red-100 text-red-900">
                  <CardTitle className="text-xl flex items-center gap-2"><ArrowLeft className="h-5 w-5 cursor-pointer hover:opacity-70" onClick={() => setMode('review')}/> Return Submission</CardTitle>
                  <CardDescription className="text-red-800/80">Provide a reason so the student knows what to fix before resubmitting.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 flex flex-col flex-1 h-full bg-slate-50/50">
                  <label className="text-sm font-bold text-[#0B1E43] mb-3 block">Reason for Return *</label>
                  <textarea 
                    value={gradeForm.returnReason}
                    onChange={(e: any) => setGradeForm({ ...gradeForm, returnReason: e.target.value })}
                    placeholder="e.g., The conclusion is missing, please revise and resubmit."
                    className="min-h-[200px] bg-white border-muted/50 rounded-2xl focus:ring-2 focus:ring-red-500/20 resize-none p-6 w-full shadow-sm"
                  />
                  <div className="mt-auto pt-8">
                    <Button 
                      onClick={() => submitAction('returned')}
                      disabled={saving || !gradeForm.returnReason.trim()}
                      className="w-full rounded-2xl h-14 font-bold bg-red-600 hover:bg-red-700 shadow-md text-lg text-white"
                    >
                      {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Confirm Return"}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {(data.status === "approved" || mode === 'grade' || data.status === "graded") && (
              <>
                <CardHeader className="p-8 pb-4 bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl">Grading Rubric</CardTitle>
                  <CardDescription>Assign marks, academic credits, and provide constructive feedback.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                  
                  <div className="grid grid-cols-2 gap-6">
                    {data.assignmentRubric && data.assignmentRubric.length > 0 ? (
                      <div className="col-span-2 space-y-4 mb-4 bg-white p-6 rounded-2xl border border-muted/50">
                        <h4 className="font-bold text-[#0B1E43]">Rubric Evaluation</h4>
                        <div className="grid gap-4">
                          {data.assignmentRubric.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                              <div className="flex-1">
                                <span className="font-bold text-[#0B1E43] block">{item.criteria}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number"
                                  min="0"
                                  max={item.marks}
                                  step="0.5"
                                  value={gradeForm.rubricScores[item.criteria] !== undefined ? gradeForm.rubricScores[item.criteria] : ""}
                                  onChange={(e) => handleRubricScoreChange(item.criteria, e.target.value, item.marks)}
                                  disabled={isGraded}
                                  className="w-20 text-center font-bold bg-white"
                                  placeholder="0"
                                />
                                <span className="text-muted-foreground font-bold">/ {item.marks}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-[#0B1E43] flex items-center justify-between">
                        Marks Given
                        <span className="text-xs text-muted-foreground font-medium">Max: {data.maxMarks}</span>
                      </label>
                      <div className="relative">
                        <Input 
                          type="number"
                          min="0"
                          max={data.maxMarks}
                          step="0.5"
                          value={gradeForm.marks}
                          onChange={(e) => setGradeForm({ ...gradeForm, marks: e.target.value })}
                          disabled={isGraded || (data.assignmentRubric && data.assignmentRubric.length > 0)}
                          className="h-16 text-3xl font-black text-[#0B1E43] pl-6 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-[#0B1E43] flex items-center justify-between">
                        Credits Awarded
                        <span className="text-xs text-muted-foreground font-medium">Max: {data.maxCredits}</span>
                      </label>
                      <div className="relative">
                        <Input 
                          type="number"
                          min="0"
                          max={data.maxCredits}
                          step="1"
                          value={gradeForm.credits}
                          onChange={(e) => setGradeForm({ ...gradeForm, credits: e.target.value })}
                          disabled={isGraded}
                          className="h-16 text-3xl font-black text-green-700 pl-6 bg-green-50 border-none rounded-2xl focus-visible:ring-green-500/20"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-muted/50">
                    <label className="text-sm font-bold text-[#0B1E43]">Professor Feedback</label>
                    <textarea 
                      value={gradeForm.feedback}
                      onChange={(e: any) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                      disabled={isGraded}
                      placeholder="Provide detailed feedback on the student's work..."
                      className="min-h-[200px] bg-[#F4F7FE] border-none rounded-2xl focus:ring-2 focus:ring-primary/20 resize-none p-6 w-full"
                    />
                  </div>

                </CardContent>
                {!isGraded && (
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                    <Button 
                      onClick={() => submitAction('graded', true)}
                      disabled={saving || !gradeForm.marks}
                      variant="outline"
                      className="w-1/3 rounded-2xl h-14 font-bold bg-white text-[#0B1E43] shadow-sm text-lg"
                    >
                      {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Save Draft"}
                    </Button>
                    <Button 
                      onClick={() => submitAction('graded', false)}
                      disabled={saving || !gradeForm.marks}
                      className="w-2/3 rounded-2xl h-14 font-bold bg-[#1E5EFF] hover:bg-blue-700 shadow-md text-lg"
                    >
                      {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <><CheckCircle className="mr-2 h-5 w-5" /> Approve & Publish</>}
                    </Button>
                  </div>
                )}
              </>
            )}

            {data.status === "returned" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-red-50/30 text-center">
                <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
                <h3 className="text-2xl font-bold text-red-900 mb-2">Returned for Correction</h3>
                <p className="text-red-800/80 mb-6 max-w-md">You returned this submission to the student. They will need to upload a new version.</p>
                <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm text-left w-full max-w-md">
                  <span className="text-xs font-bold text-red-800 uppercase tracking-wider block mb-2">Reason Provided</span>
                  <p className="text-slate-700 italic">"{data.returnReason}"</p>
                </div>
              </div>
            )}

          </Card>
        </div>

      </div>
    </div>
  )
}
