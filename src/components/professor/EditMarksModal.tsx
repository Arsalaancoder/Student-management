// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, History, Save, X, Edit3, CheckCircle2, Clock } from "lucide-react"
import { toast } from "sonner"

interface EditMarksModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  submission: {
    id: string
    studentName: string
    studentId: string
    assignmentId: string
    assignmentTitle: string
    maxMarks: number
    maxCredits: number
    currentMarks?: number | null
    currentCredits?: number | null
    currentFeedback?: string | null
  } | null
}

interface AuditLog {
  id: string
  changed_at: string
  previous_marks: number | null
  new_marks: number | null
  previous_credits: number | null
  new_credits: number | null
  previous_feedback: string | null
  new_feedback: string | null
  professor_name?: string
}

export default function EditMarksModal({
  isOpen,
  onClose,
  onSuccess,
  submission,
}: EditMarksModalProps) {
  const { profile } = useAuth()
  const [marks, setMarks] = useState<string>("")
  const [credits, setCredits] = useState<string>("")
  const [feedback, setFeedback] = useState<string>("")
  const [saving, setSaving] = useState(false)
  
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])

  useEffect(() => {
    if (submission) {
      setMarks(submission.currentMarks !== undefined && submission.currentMarks !== null ? String(submission.currentMarks) : "")
      setCredits(submission.currentCredits !== undefined && submission.currentCredits !== null ? String(submission.currentCredits) : String(submission.maxCredits || 0))
      setFeedback(submission.currentFeedback || "")
      setShowHistory(false)
    }
  }, [submission, isOpen])

  const fetchAuditHistory = async () => {
    if (!submission?.id) return
    try {
      setHistoryLoading(true)
      const { data, error } = await supabase
        .from("grade_audit_logs")
        .select(`
          id,
          changed_at,
          previous_marks,
          new_marks,
          previous_credits,
          new_credits,
          previous_feedback,
          new_feedback,
          profiles:professor_id (full_name)
        `)
        .eq("submission_id", submission.id)
        .order("changed_at", { ascending: false })

      if (error) throw error

      const formatted = (data || []).map((log: any) => ({
        id: log.id,
        changed_at: log.changed_at,
        previous_marks: log.previous_marks,
        new_marks: log.new_marks,
        previous_credits: log.previous_credits,
        new_credits: log.new_credits,
        previous_feedback: log.previous_feedback,
        new_feedback: log.new_feedback,
        professor_name: log.profiles?.full_name || "Professor"
      }))

      setAuditLogs(formatted)
    } catch (err: any) {
      console.error("Error fetching audit history:", err)
      toast.error("Failed to load edit history")
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleHistory = () => {
    if (!showHistory) {
      fetchAuditHistory()
    }
    setShowHistory(!showHistory)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !submission) return

    const numMarks = parseFloat(marks)
    const numCredits = parseFloat(credits || "0")

    if (isNaN(numMarks)) {
      toast.error("Please enter a valid numeric value for marks.")
      return
    }

    if (numMarks < 0) {
      toast.error("Marks cannot be negative.")
      return
    }

    if (numMarks > submission.maxMarks) {
      toast.error(`Marks cannot exceed maximum marks (${submission.maxMarks}).`)
      return
    }

    if (isNaN(numCredits) || numCredits < 0) {
      toast.error("Credits must be a valid non-negative number.")
      return
    }

    try {
      setSaving(true)

      const { error } = await supabase.rpc("edit_submission_grade", {
        p_submission_id: submission.id,
        p_professor_id: profile.id,
        p_marks: numMarks,
        p_credits: numCredits,
        p_feedback: feedback.trim() || null,
      })

      if (error) throw error

      toast.success("Marks & feedback updated successfully!")
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Error saving marks:", err)
      toast.error(err.message || "Failed to update marks. Please check permissions.")
    } finally {
      setSaving(false)
    }
  }

  if (!submission) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-800/80 p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-[#1E5EFF] dark:text-blue-400 flex items-center justify-center font-bold">
                <Edit3 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-[#0B1E43] dark:text-white">
                  Edit Student Submission
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update marks, credits, and feedback for this evaluation.
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleHistory}
              className="rounded-xl border-slate-200 dark:border-slate-700 text-xs font-bold gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5 text-[#1E5EFF]" />
              {showHistory ? "Back to Form" : "View History"}
            </Button>
          </div>

          {/* Student Info Card */}
          <div className="mt-4 p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 dark:text-slate-500 font-semibold block text-[10px] uppercase">Student</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{submission.studentName}</span>
              <span className="text-[11px] text-slate-500">ID: {submission.studentId}</span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 font-semibold block text-[10px] uppercase">Assignment</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{submission.assignmentTitle}</span>
              <span className="text-[11px] text-slate-500">Max Marks: <strong className="text-slate-700 dark:text-slate-300">{submission.maxMarks}</strong></span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          {showHistory ? (
            /* Audit History View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#0B1E43] dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="h-4 w-4 text-[#1E5EFF]" /> Mark Change History
                </h4>
                <Badge variant="outline" className="text-[11px] rounded-lg">
                  {auditLogs.length} Changes Recorded
                </Badge>
              </div>

              {historyLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Clock className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No previous changes logged.</p>
                  <p className="text-[11px] text-slate-400 mt-1">First evaluation or initial mark updates will be recorded here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{log.professor_name}</span>
                        <span>{new Date(log.changed_at).toLocaleString()}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <div>
                          <span className="text-[10px] uppercase text-slate-400 font-semibold block">Marks</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-400 line-through mr-1">
                            {log.previous_marks !== null ? `${log.previous_marks}/${submission.maxMarks}` : "N/A"}
                          </span>
                          &rarr;
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-1">
                            {log.new_marks !== null ? `${log.new_marks}/${submission.maxMarks}` : "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400 font-semibold block">Credits</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-400 line-through mr-1">
                            {log.previous_credits !== null ? log.previous_credits : "0"}
                          </span>
                          &rarr;
                          <span className="font-bold text-blue-600 dark:text-blue-400 ml-1">
                            {log.new_credits !== null ? log.new_credits : "0"}
                          </span>
                        </div>
                      </div>

                      {log.new_feedback && (
                        <div className="pt-1 text-[11px] text-slate-600 dark:text-slate-300 italic">
                          "{log.new_feedback}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Editable Form View */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Marks Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Marks (Max {submission.maxMarks}) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max={submission.maxMarks}
                    placeholder={`0 - ${submission.maxMarks}`}
                    value={marks}
                    onChange={(e) => setMarks(e.target.value)}
                    required
                    className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11 focus-visible:ring-primary/20 font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                {/* Credits Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Credits (Max {submission.maxCredits})
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max={submission.maxCredits}
                    placeholder={`0 - ${submission.maxCredits}`}
                    value={credits}
                    onChange={(e) => setCredits(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11 focus-visible:ring-primary/20 font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Feedback Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Feedback & Comments
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide constructive feedback for the student..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-white font-medium resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1E5EFF] hover:bg-blue-700 text-white font-bold rounded-xl text-xs gap-1.5 px-5"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
