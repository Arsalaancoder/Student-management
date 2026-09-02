// @ts-nocheck
import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, UploadCloud, FileText, CheckCircle, Clock, Calendar, AlertCircle, FileCheck, CheckCircle2, Search, X, Loader2, Sparkles, Wand2, TrendingUp, AlertTriangle, ShieldAlert, File } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import AIPanel from "@/components/ai/AIPanel"
import { invokeAIAssistant } from "@/lib/ai"
import { createNotification } from "@/lib/notifications"
import { isAssignmentTargetedToStudent } from "@/lib/targeting"
import { triggerSimilarityCheck, checkPlagiarismPreSubmission, finalizePlagiarismCheck } from "@/lib/plagiarismApi"
import { PLAGIARISM_CONFIG } from "@/lib/plagiarismConfig"
import { triggerSubmissionNotification } from "@/lib/fcm"

export default function AssignmentDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [assignment, setAssignment] = useState<any>(null)
  const [submission, setSubmission] = useState<any>(null)
  const [versions, setVersions] = useState<any[]>([])
  const [grade, setGrade] = useState<any>(null)
  const [similarityReport, setSimilarityReport] = useState<any>(null)
  
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile || !id) return

    const fetchDetails = async () => {
      try {
        setLoading(true)
        
        // 1. Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from("assignments")
          .select(`
            *,
            subjects (name),
            profiles:created_by (full_name),
            assignment_sections (section)
          `)
          .eq("id", id)
          .single()
          
        if (assignmentError) throw assignmentError

        if (!isAssignmentTargetedToStudent(assignmentData, profile)) {
          console.warn("[Security] Student attempted to access assignment not targeted to their academic profile.")
          setAssignment(null)
          setLoading(false)
          return
        }

        setAssignment(assignmentData)

        // 2. Fetch student's submission
        const { data: submissionData } = await supabase
          .from("submissions")
          .select("*")
          .eq("assignment_id", id)
          .eq("student_id", profile.id)
          .single()

        if (submissionData) {
          setSubmission(submissionData)
          
          // 3. Fetch submission versions
          const { data: versionsData } = await supabase
            .from("submission_versions")
            .select("*")
            .eq("submission_id", submissionData.id)
            .order("version_number", { ascending: false })
            
          setVersions(versionsData || [])

          // 4. Fetch grade if exists
          const { data: gradeData } = await supabase
            .from("grades")
            .select("*, profiles:professor_id(full_name)")
            .eq("submission_id", submissionData.id)
            .single()
            
          if (gradeData && !gradeData.is_draft) setGrade(gradeData)

          // 5. Fetch similarity report
          const { data: reportData } = await supabase
            .from("plagiarism_reports")
            .select("*")
            .eq("submission_id", submissionData.id)
            .single()
          
          if (reportData) setSimilarityReport(reportData)
        }

      } catch (error) {
        console.error("Error fetching assignment details:", error)
        toast.error("Failed to load assignment details")
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [profile, id])

  // AI States
  const [aiExplainContent, setAiExplainContent] = useState<string | null>(null)
  const [aiExplainLoading, setAiExplainLoading] = useState(false)
  const [aiExplainError, setAiExplainError] = useState<string | null>(null)

  const [aiReviewContent, setAiReviewContent] = useState<string | null>(null)
  const [aiReviewLoading, setAiReviewLoading] = useState(false)
  const [aiReviewError, setAiReviewError] = useState<string | null>(null)

  const [aiSummaryContent, setAiSummaryContent] = useState<string | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null)

  const handleExplainAssignment = async () => {
    try {
      setAiExplainLoading(true)
      setAiExplainError(null)
      const result = await invokeAIAssistant('explain_assignment', {
        title: assignment.title,
        description: assignment.description,
        instructions: assignment.instructions
      })
      setAiExplainContent(result)
    } catch (err: any) {
      setAiExplainError(err.message)
    } finally {
      setAiExplainLoading(false)
    }
  }

  const handleReviewWork = async () => {
    if (!selectedFile) return
    try {
      setAiReviewLoading(true)
      setAiReviewError(null)
      
      const text = await selectedFile.text().catch(() => "Unable to extract text from this file format.")
      
      const result = await invokeAIAssistant('review_submission', {
        title: assignment.title,
        instructions: assignment.instructions,
        studentWork: text.substring(0, 5000)
      })
      setAiReviewContent(result)
    } catch (err: any) {
      setAiReviewError(err.message)
    } finally {
      setAiReviewLoading(false)
    }
  }

  const handleFeedbackSummary = async () => {
    if (!grade) return
    try {
      setAiSummaryLoading(true)
      setAiSummaryError(null)
      const result = await invokeAIAssistant('feedback_summary', {
        title: assignment.title,
        score: grade.marks,
        maxMarks: assignment.max_marks,
        feedback: grade.feedback
      })
      setAiSummaryContent(result)
    } catch (err: any) {
      setAiSummaryError(err.message)
    } finally {
      setAiSummaryLoading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      validateAndSetFile(file)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      validateAndSetFile(file)
    }
  }

  const validateAndSetFile = (file: File) => {
    // Reset plagiarism state per selected file (Section H)
    setPlagiarismBlockedResult(null)
    setPlagiarismChecking(false)
    setPlagiarismStep(0)

    // 15MB limit to optimize Supabase Storage bandwidth
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 15MB.")
      return
    }

    // Allowed File Types check
    if (assignment?.allowed_file_types && assignment.allowed_file_types.length > 0) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      if (!assignment.allowed_file_types.includes(extension)) {
        toast.error(`Invalid file type. Allowed types: ${assignment.allowed_file_types.join(", ")}`)
        return
      }
    }

    setSelectedFile(file)
  }

  const [plagiarismChecking, setPlagiarismChecking] = useState(false)
  const [plagiarismStep, setPlagiarismStep] = useState(0)
  const [plagiarismBlockedResult, setPlagiarismBlockedResult] = useState<any>(null)

  const handleUpload = async () => {
    if (!selectedFile || !profile || !assignment) return

    try {
      setUploading(true)
      setPlagiarismChecking(true)
      setPlagiarismStep(1) // File validated (01)
      setPlagiarismBlockedResult(null)

      // Step 1: Pre-Submission Plagiarism Check (02-07 execute on server)
      const checkRes = await checkPlagiarismPreSubmission(selectedFile, assignment.id, profile.id)

      console.log('[PLAGIARISM] 08 presubmit_response_received', { httpStatus: 200 })
      console.log('[PLAGIARISM] 09 decision_received', { allowed: checkRes?.allowed, status: checkRes?.status, score: checkRes?.finalScore })

      if (!checkRes.allowed || checkRes.status === 'blocked' || checkRes.status === 'failed' || checkRes.success === false) {
        setPlagiarismChecking(false)
        setUploading(false)
        if (checkRes.status === 'failed' || checkRes.success === false) {
          toast.error(checkRes.message || "Plagiarism check failed. Submission prevented.")
          return
        }
        setPlagiarismBlockedResult({
          similarity: checkRes.finalScore ?? checkRes.similarity,
          message: checkRes.message || "Significant similarity was found with an existing submission. Please revise your work and submit again."
        })
        return
      }

      // Pre-check passed: set UI progress to similarity complete (Step 5)
      setPlagiarismStep(5)

      // Step 2: Upload File to Storage (Allowed PASS or FLAG)
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `${profile.id}/${assignment.id}/${Date.now()}.${fileExt}`

      console.log('[PLAGIARISM] 10 submission_upload_started', { bucket: 'submissions', filePath: fileName, fileSize: selectedFile.size })

      const { error: uploadError } = await supabase.storage
        .from('submissions')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('[PLAGIARISM] fileUploadError', uploadError)
        throw uploadError
      }

      console.log('[PLAGIARISM] 11 submission_upload_finished', { filePath: fileName })

      const filePath = fileName
      let currentSubmissionId = submission?.id
      let newVersionNumber = 1
      const submissionStatus = 'submitted'

      console.log('[SUBMISSION] Inserting submission status:', { submissionStatus, plagiarismStatus: checkRes?.status })

      // Step 3: Insert / Update Submission Record
      console.log('[PLAG] 9 submission insert', { assignmentId: assignment.id, studentId: profile.id, submissionStatus })

      if (!currentSubmissionId) {
        const { data: newSub, error: subError } = await supabase
          .from("submissions")
          .insert({
            assignment_id: assignment.id,
            student_id: profile.id,
            status: submissionStatus,
            similarity_score: checkRes.finalScore,
            current_version: 1
          })
          .select()
          .single()

        if (subError) {
          console.error('[PLAG ERROR]', { stage: '9 submission insert', code: subError.code, message: subError.message })
          throw subError
        }
        currentSubmissionId = newSub.id
        setSubmission(newSub)

        console.log('[PLAG] 10 submission inserted', { submissionId: currentSubmissionId })

        await createNotification(
          assignment.created_by,
          "New Submission",
          `${profile.full_name} has submitted ${assignment.title}.`,
          "new_submission"
        )

        await createNotification(
          profile.id,
          "Submission Confirmed",
          `Your work for ${assignment.title} has been successfully submitted.`,
          "submission_confirmation"
        )
      } else {
        newVersionNumber = (submission.current_version || 1) + 1
        const { error: updateError } = await supabase
          .from("submissions")
          .update({
            status: submissionStatus,
            similarity_score: checkRes.finalScore,
            current_version: newVersionNumber,
            updated_at: new Date().toISOString()
          })
          .eq("id", currentSubmissionId)

        if (updateError) {
          console.error('[PLAGIARISM] submissionUpdateError', { code: updateError.code, message: updateError.message })
          throw updateError
        }
        setSubmission({ ...submission, status: submissionStatus, similarity_score: checkRes.finalScore, current_version: newVersionNumber })

        console.log('[PLAGIARISM] 13 submission_insert_finished', { submissionId: currentSubmissionId, updateSuccess: true })

        await createNotification(
          assignment.created_by,
          "Resubmission",
          `${profile.full_name} has resubmitted ${assignment.title}.`,
          "resubmission"
        )

        await createNotification(
          profile.id,
          "Resubmission Confirmed",
          `Your updated work for ${assignment.title} has been successfully submitted.`,
          "submission_confirmation"
        )
      }

      // Step 4: Create Submission Version
      const { data: newVersion, error: verError } = await supabase
        .from("submission_versions")
        .insert({
          submission_id: currentSubmissionId,
          version_number: newVersionNumber,
          file_url: filePath,
          file_name: selectedFile.name,
          file_size: selectedFile.size
        })
        .select()
        .single()

      if (verError) throw verError

      // Step 5: Finalize Plagiarism Check Records
      setPlagiarismStep(6) // Finalizing plagiarism report

      console.log('[PLAGIARISM] 14 finalize_request_started', { checkId: checkRes.checkId, submissionId: currentSubmissionId })

      const finalizeRes = await finalizePlagiarismCheck({
        checkId: checkRes.checkId,
        submissionId: currentSubmissionId,
        targetFeaturesData: checkRes.targetFeaturesData,
        matchesToInsert: checkRes.matchesToInsert,
        finalScore: checkRes.finalScore,
        status: checkRes.status
      })

      console.log('[PLAGIARISM] 21 finalize_response_received', { httpStatus: 200, success: finalizeRes?.success !== false })

      setVersions([newVersion, ...versions])
      setSelectedFile(null)
      setSimilarityReport({
        submission_id: currentSubmissionId,
        similarity_percentage: checkRes.finalScore ?? 0,
        status: checkRes.status || 'completed'
      })

      console.log('[PLAGIARISM] 22 UI_success')

      if (checkRes.status === 'no_candidates') {
        toast.success("Originality check passed. No previous submissions were available for comparison.")
      } else if (checkRes.status === 'flagged') {
        toast.warning(`Similarity detected: ${checkRes.finalScore}%. Your submission has been accepted but marked for professor review.`)
      } else {
        toast.success(`Originality Check Passed. Similarity: ${checkRes.finalScore}%. Assignment submitted successfully!`)
      }

      triggerSubmissionNotification(currentSubmissionId).catch(err => {
        console.warn("FCM push warning:", err)
      })

    } catch (error: any) {
      console.error("[PLAGIARISM] uploadError", error)
      toast.error(error.message || "Unable to finalize originality check. Your assignment has not been submitted. Please try again.")
    } finally {
      setUploading(false)
      setPlagiarismChecking(false)
    }
  }

  const downloadFile = async (filePath: string, originalName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('submissions')
        .createSignedUrl(filePath, 60)

      if (error) throw error
      
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = originalName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error downloading file:", error)
      toast.error("Failed to download file")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-10">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24 rounded-lg" />
            <Skeleton className="h-10 w-64 rounded-lg" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-[400px] w-full rounded-[2rem]" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full rounded-[2rem]" />
          </div>
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <EmptyState 
        icon={FileText} 
        title="Assignment not found" 
        description="The assignment you are looking for does not exist or you do not have permission to view it." 
        action={{ label: "Go Back", onClick: () => navigate('/student/assignments') }}
      />
    )
  }

  const isOverdue = new Date(assignment.deadline).getTime() < new Date().getTime()
  const isReturned = submission?.status === 'returned'
  const isSubmittedOrLater = submission && submission.status !== 'draft' && submission.status !== 'not_started' && submission.status !== 'returned'
  const hasSubmitted = !!submission
  const canSubmit = !isSubmittedOrLater && (!isOverdue || isReturned)

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 max-w-5xl mx-auto">
      
      <Button variant="ghost" className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Assignments
      </Button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold tracking-wide uppercase">
              {assignment.subject_name || assignment.subjects?.name || "General"}
            </span>
            {submission && (
              <span className={`px-3 py-1 rounded-lg text-xs font-bold tracking-wide uppercase ${
                grade ? "bg-green-100 text-green-700" : 
                isReturned ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
              }`}>
                {grade ? "Graded" : submission.status.replace("_", " ")}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">{assignment.title}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <span className="font-medium">Professor:</span> {assignment.profiles?.full_name}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content: Left side */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-8 py-6 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Instructions</CardTitle>
              <Button variant="outline" size="sm" className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={handleExplainAssignment} disabled={aiExplainLoading}>
                <Sparkles className="h-4 w-4" /> Understand Assignment
              </Button>
            </CardHeader>
            <CardContent className="p-8 prose prose-slate max-w-none">
              <div className={aiExplainContent || aiExplainLoading || aiExplainError ? "mb-6" : ""}>
                <AIPanel 
                  title="Assignment Breakdown"
                  content={aiExplainContent} 
                  loading={aiExplainLoading} 
                  error={aiExplainError} 
                  onClose={() => {setAiExplainContent(null); setAiExplainError(null)}}
                  onRegenerate={handleExplainAssignment}
                />
              </div>
              <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                {assignment.description || "No description provided."}
              </p>
              {assignment.instructions && (
                <div className="mt-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider">Additional Notes</h4>
                  <p className="whitespace-pre-wrap text-slate-600 text-sm">
                    {assignment.instructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Return Reason Warning */}
          {isReturned && submission?.return_reason && (
            <div className="bg-red-50 border border-red-200 rounded-[2rem] p-8 text-red-900 flex gap-4 items-start">
              <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg mb-2">Assignment Returned for Correction</h3>
                <p className="whitespace-pre-wrap text-sm text-red-800 bg-white/60 p-4 rounded-xl border border-red-100">"{submission.return_reason}"</p>
                <p className="mt-4 text-sm font-bold">Please address the feedback and upload a new version below.</p>
              </div>
            </div>
          )}

          {/* Submission Section */}
          <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden" id="submission">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-8 py-6 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Your Submission</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              
              {canSubmit ? (
                <div className="space-y-6">

                  {/* Plagiarism Progress Loading Modal */}
                  {plagiarismChecking && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2rem] bg-white overflow-hidden p-8 space-y-6">
                        <div className="flex flex-col items-center text-center">
                          <div className="h-14 w-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                            <Loader2 className="h-7 w-7 animate-spin" />
                          </div>
                          <h3 className="text-xl font-bold text-[#0B1E43]">Checking your assignment...</h3>
                          <p className="text-sm text-slate-500 mt-1">Analyzing document text and calculating originality score.</p>
                        </div>

                        <div className="space-y-3 bg-slate-50 p-6 rounded-2xl border border-slate-100 text-sm">
                          <div className="flex items-center gap-3 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>File validated</span>
                          </div>
                          <div className={`flex items-center gap-3 font-semibold ${plagiarismStep >= 2 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {plagiarismStep >= 2 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                            <span>Text extracted</span>
                          </div>
                          <div className={`flex items-center gap-3 font-semibold ${plagiarismStep >= 3 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {plagiarismStep >= 3 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                            <span>Comparing with previous submissions</span>
                          </div>
                          <div className={`flex items-center gap-3 font-semibold ${plagiarismStep >= 4 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {plagiarismStep >= 4 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                            <span>Checking phrase similarity</span>
                          </div>
                          <div className={`flex items-center gap-3 font-semibold ${plagiarismStep >= 5 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {plagiarismStep >= 5 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                            <span>Checking semantic similarity</span>
                          </div>
                          <div className={`flex items-center gap-3 font-semibold ${plagiarismStep >= 6 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {plagiarismStep >= 6 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0 animate-pulse" />}
                            <span>Finalizing plagiarism report</span>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Plagiarism Blocked Result Alert Banner */}
                  {plagiarismBlockedResult && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 text-red-900 space-y-4 my-2 animate-in fade-in">
                      <div className="flex items-start gap-4">
                        <ShieldAlert className="h-8 w-8 text-red-600 shrink-0 mt-1" />
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold text-red-900">Submission Blocked</h3>
                          <p className="font-semibold text-red-700">
                            Similarity detected: <span className="text-2xl font-black text-red-600">{plagiarismBlockedResult.similarity}%</span>
                          </p>
                          <p className="text-sm text-red-800 leading-relaxed bg-white/70 p-4 rounded-2xl border border-red-100">
                            {plagiarismBlockedResult.message}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" className="border-red-200 text-red-800 hover:bg-red-100 rounded-full font-bold" onClick={() => setPlagiarismBlockedResult(null)}>
                          Revise Document & Try Again
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Upload Zone */}
                  <div 
                    className={`relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all ${
                      dragActive ? "border-primary bg-primary/5 scale-[1.02]" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleChange}
                    />
                    
                    {selectedFile ? (
                      <div className="flex flex-col items-center text-center">
                        <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                          <File className="h-8 w-8" />
                        </div>
                        <p className="font-bold text-slate-900">{selectedFile.name}</p>
                        <p className="text-sm text-slate-500 mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                        
                        <div className="flex flex-wrap gap-3 mt-6 justify-center">
                          <Button variant="outline" className="rounded-full" onClick={() => setSelectedFile(null)} disabled={uploading}>
                            Cancel
                          </Button>
                          <Button variant="outline" className="rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2" onClick={handleReviewWork} disabled={uploading || aiReviewLoading}>
                            <Sparkles className="h-4 w-4" /> Review My Work
                          </Button>
                          <Button className="rounded-full px-8 bg-[#1E5EFF] hover:bg-blue-700 font-bold" onClick={handleUpload} disabled={uploading}>
                            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking & Submitting...</> : 'Check & Submit'}
                          </Button>
                        </div>
                        <div className="w-full mt-6 text-left">
                          <AIPanel 
                            title="Pre-submission Review"
                            content={aiReviewContent} 
                            loading={aiReviewLoading} 
                            error={aiReviewError} 
                            onClose={() => {setAiReviewContent(null); setAiReviewError(null)}}
                            onRegenerate={handleReviewWork}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="h-16 w-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <UploadCloud className="h-8 w-8" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-900 mb-2">Click to upload or drag & drop</h3>
                        <p className="text-sm text-slate-500 max-w-xs mb-2">
                          Maximum size: 50MB.
                        </p>
                        {assignment.allowed_file_types && assignment.allowed_file_types.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-center mt-2">
                            {assignment.allowed_file_types.map((type: string) => (
                              <span key={type} className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">{type}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : isOverdue && !hasSubmitted ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                  <Clock className="h-12 w-12 text-red-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-red-900">Submission deadline has passed.</h3>
                  <p className="text-red-700 mt-1">You can no longer submit files for this assignment.</p>
                </div>
              ) : grade ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-green-900">Assignment Graded</h3>
                  <p className="text-green-700 mt-1">Review your grade and feedback below.</p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-blue-900">Assignment Submitted</h3>
                  <p className="text-blue-700 mt-1">Your submission is currently <span className="font-bold">{submission.status.replace("_", " ")}</span>.</p>
                </div>
              )}

              {/* Version History */}
              {versions.length > 0 && (
                <div className="mt-8">
                  <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-400" />
                    Submission History
                  </h4>
                  <div className="space-y-3">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="h-10 w-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <File className="h-5 w-5 text-slate-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-slate-900 truncate">{v.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span className="font-bold bg-slate-200 px-2 py-0.5 rounded">v{v.version_number}</span>
                              <span>•</span>
                              <span>{new Date(v.submitted_at).toLocaleString()}</span>
                              <span>•</span>
                              <span>{((v.file_size || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="font-bold text-[#1E5EFF]" onClick={() => downloadFile(v.file_url, v.file_name)}>
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Right side */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem] bg-[#1A1F36] text-white">
            <CardContent className="p-8 space-y-6">
              
              <div>
                <span className="text-white/60 text-sm font-medium uppercase tracking-wider block mb-2">Deadline</span>
                <div className="flex items-center gap-3 text-lg font-bold">
                  <Calendar className="h-5 w-5 text-blue-400" />
                  {new Date(assignment.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                {isOverdue && !hasSubmitted && (
                  <span className="inline-block mt-2 px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded">OVERDUE</span>
                )}
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <span className="text-white/60 text-sm font-medium uppercase tracking-wider block mb-2">Points Possible</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold">{assignment.max_marks}</span>
                  <span className="text-white/60 font-medium">marks</span>
                </div>
              </div>

              {assignment.max_credits > 0 && (
                <div>
                  <span className="text-white/60 text-sm font-medium uppercase tracking-wider block mb-2">Credits Possible</span>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 font-bold rounded-lg text-sm">
                      +{assignment.max_credits} Credits
                    </span>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Student Similarity Report Widget */}
          {submission && (
            <Card className="border-none shadow-sm rounded-[2rem] bg-indigo-50 border border-indigo-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-indigo-900 text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-indigo-500" />
                  Similarity Check
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!similarityReport || similarityReport.status === 'processing' ? (
                  <div className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    {PLAGIARISM_CONFIG.STUDENT_MESSAGES.PROCESSING}
                  </div>
                ) : similarityReport.status === 'processing_failed' ? (
                  <div className="text-sm font-semibold text-slate-700">
                    {PLAGIARISM_CONFIG.STUDENT_MESSAGES.FAILED}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm font-bold text-indigo-950">
                      {similarityReport.status === 'no_candidates'
                        ? 'Originality check passed. No previous submissions were available for comparison.'
                        : similarityReport.similarity_percentage >= PLAGIARISM_CONFIG.HIGH_THRESHOLD
                        ? PLAGIARISM_CONFIG.STUDENT_MESSAGES.HIGH
                        : similarityReport.similarity_percentage >= PLAGIARISM_CONFIG.REVIEW_THRESHOLD
                        ? PLAGIARISM_CONFIG.STUDENT_MESSAGES.REVIEW
                        : PLAGIARISM_CONFIG.STUDENT_MESSAGES.LOW}
                    </div>

                    {similarityReport.status !== 'no_candidates' && (
                      <div>
                        <div className="flex justify-between text-xs font-bold text-indigo-900 mb-1">
                          <span>Originality Index</span>
                          <span>{Math.max(0, 100 - similarityReport.similarity_percentage)}%</span>
                        </div>
                        <div className="h-2 w-full bg-indigo-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.max(0, 100 - similarityReport.similarity_percentage)}%` }} 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {grade && (
            <Card className="border-none shadow-sm rounded-[2rem] bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-green-800">Grade Received</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-5xl font-extrabold text-green-600">{grade.marks}</span>
                  <span className="text-green-700/60 font-bold text-xl">/ {assignment.max_marks}</span>
                </div>
                
                {grade.credits > 0 && (
                  <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-bold">
                    <TrendingUp className="h-4 w-4" />
                    Awarded {grade.credits} Credits
                  </div>
                )}

                {grade.rubric_scores && Object.keys(grade.rubric_scores).length > 0 && (
                  <div className="mb-4 space-y-2">
                    <span className="text-green-800 text-sm font-bold uppercase tracking-wider block mb-2">Rubric Breakdown</span>
                    <div className="bg-white/60 rounded-xl p-4 space-y-2 border border-green-100">
                      {Object.entries(grade.rubric_scores).map(([criteria, score]: [string, any]) => {
                        const rubricDef = assignment.rubric?.find((r: any) => r.criteria === criteria)
                        const maxMarks = rubricDef ? rubricDef.marks : "?"
                        return (
                          <div key={criteria} className="flex justify-between items-center text-sm">
                            <span className="font-bold text-green-900">{criteria}</span>
                            <span className="text-green-800 font-bold">{score} / {maxMarks}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {grade.feedback && (
                  <div className="mt-4">
                    <span className="text-green-800 text-sm font-bold uppercase tracking-wider block mb-2">Professor Feedback</span>
                    <p className="text-green-900 bg-white/60 rounded-xl p-4 text-sm leading-relaxed">
                      "{grade.feedback}"
                    </p>
                  </div>
                )}

                <div className="mt-6 text-left">
                  {!aiSummaryContent && !aiSummaryLoading && !aiSummaryError ? (
                    <Button variant="outline" size="sm" className="gap-2 border-green-200 text-green-800 hover:bg-green-50 w-full" onClick={handleFeedbackSummary}>
                      <Sparkles className="h-4 w-4" /> Generate AI Feedback Summary
                    </Button>
                  ) : (
                    <AIPanel 
                      title="Feedback Summary"
                      content={aiSummaryContent} 
                      loading={aiSummaryLoading} 
                      error={aiSummaryError} 
                      onRegenerate={handleFeedbackSummary}
                    />
                  )}
                </div>
                
                <div className="mt-4 text-xs text-green-700/60 font-medium">
                  Graded on {new Date(grade.graded_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
