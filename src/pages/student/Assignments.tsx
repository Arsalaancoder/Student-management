// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Filter, FileText, Calendar, ChevronRight, Plus, BookOpen, Loader2, X, AlertCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "sonner"
import { isAssignmentTargetedToStudent } from "@/lib/targeting"

type AssignmentStatus = "Not Started" | "Draft" | "Submitted" | "Under Review" | "Approved" | "Returned" | "Graded"

interface AssignmentData {
  id: string
  title: string
  subjectName: string
  subjectId: string
  deadline: string
  status: AssignmentStatus
  marks?: number
  maxMarks?: number
  maxCredits?: number
}

export default function StudentAssignments() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [enrolledSubjectIds, setEnrolledSubjectIds] = useState<string[]>([])

  // Enrollment UI state
  const [showEnrollForm, setShowEnrollForm] = useState(false)
  const [enrollCode, setEnrollCode] = useState("")
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubject, setSelectedSubject] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  // Extracted unique subjects for the filter
  const subjects = Array.from(new Set(assignments.map(a => a.subjectName)))

  const fetchAssignments = async () => {
    if (!profile) return
    try {
      setLoading(true)

      // 1. Fetch enrolled subjects
      const { data: enrollments, error: enrollErr } = await supabase
        .from("enrollments")
        .select("subject_id, subjects(id, name)")
        .eq("student_id", profile.id)

      if (enrollErr) {
        console.error("Error fetching enrollments:", enrollErr)
        toast.error("Unable to load your enrolled subjects. Please try again.")
        setLoading(false)
        return
      }

      const subjectIds = (enrollments || []).map(e => e.subject_id).filter(Boolean) as string[]
      const subjectNames = (enrollments || []).map(e => (e.subjects as any)?.name).filter(Boolean) as string[]
      setEnrolledSubjectIds(subjectIds)

      // 2. Fetch assignments targeted to student's branch, year, and section or enrolled subjects
      const { data: rawAssignments, error: assignErr } = await supabase
        .from("assignments")
        .select("id, title, deadline, max_marks, max_credits, subject_name, subject_id, target_branch, target_year, all_sections, subjects(name), assignment_sections(section)")
        .order("deadline", { ascending: true })

      if (assignErr) {
        console.error("Error fetching assignments:", assignErr)
        toast.error("Unable to load assignments. Please try again.")
        setLoading(false)
        return
      }

      // Filter by student profile targeting & enrollments
      const studentProfileWithEnrollments = {
        ...profile,
        enrolledSubjectIds: subjectIds,
        enrolledSubjectNames: subjectNames
      }

      const allAssignments = (rawAssignments || []).filter(a => isAssignmentTargetedToStudent(a, studentProfileWithEnrollments))

      // 3. Fetch all submissions for this student
      const studentProfileId = profile.id
      const studentAuthId = profile.auth_user_id || profile.id
      const { data: submissions } = await supabase
        .from("submissions")
        .select("assignment_id, status")
        .or(`student_id.eq.${studentProfileId},student_id.eq.${studentAuthId}`)

      // 4. Fetch grades for this student's submissions
      const { data: grades } = await supabase
        .from("grades")
        .select("submission_id, marks, submissions(assignment_id)")

      const submissionMap = new Map<string, string>()
      submissions?.forEach(sub => {
        submissionMap.set(sub.assignment_id, sub.status)
      })

      const gradeMap = new Map<string, number>()
      grades?.forEach(g => {
        if (g.submissions && typeof g.submissions === "object" && "assignment_id" in g.submissions) {
          gradeMap.set((g.submissions as any).assignment_id, Number(g.marks))
        }
      })

      const formattedAssignments: AssignmentData[] = (allAssignments || []).map((a: any) => {
        const subStatus = submissionMap.get(a.id)
        let status: AssignmentStatus = "Not Started"

        if (subStatus === "draft") status = "Draft"
        else if (subStatus === "submitted") status = "Submitted"
        else if (subStatus === "under_review") status = "Under Review"
        else if (subStatus === "approved") status = "Approved"
        else if (subStatus === "returned") status = "Returned"
        else if (subStatus === "graded") status = "Graded"
        else if (subStatus) status = "Submitted"

        return {
          id: a.id,
          title: a.title,
          subjectName: a.subject_name || (a.subjects as any)?.name || "General",
          subjectId: a.subject_id as string,
          deadline: a.deadline,
          status,
          maxMarks: a.max_marks || 100,
          maxCredits: a.max_credits ?? 0,
          marks: gradeMap.get(a.id),
        }
      })

      setAssignments(formattedAssignments)
    } catch (error) {
      console.error("Error fetching assignments:", error)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!profile) return

    fetchAssignments()

    // 1. Supabase Realtime subscription for assignments table changes
    const channel = supabase
      .channel(`student_assignments_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments' },
        () => {
          fetchAssignments()
        }
      )
      .subscribe()

    // 2. Refetch when student returns/resumes app or switches back to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAssignments()
      }
    }

    const handleFocus = () => {
      fetchAssignments()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [profile])

  // Self-enrollment: student joins a subject by its code
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !enrollCode.trim()) return
    setEnrollError(null)

    try {
      setEnrolling(true)

      // Find the subject by code
      const { data: subject, error: subjectErr } = await supabase
        .from("subjects")
        .select("id, name, code")
        .eq("code", enrollCode.trim().toUpperCase())
        .single()

      if (subjectErr || !subject) {
        setEnrollError("Subject not found. Please check the code and try again.")
        return
      }

      // Check if already enrolled
      if (enrolledSubjectIds.includes(subject.id)) {
        setEnrollError(`You are already enrolled in ${subject.name}.`)
        return
      }

      // Insert enrollment
      const { error: insertErr } = await supabase
        .from("enrollments")
        .insert({ student_id: profile.id, subject_id: subject.id })

      if (insertErr) {
        if (insertErr.code === "23505") {
          setEnrollError(`You are already enrolled in ${subject.name}.`)
        } else {
          console.error("Enrollment error:", insertErr)
          setEnrollError("Failed to enroll. Please try again.")
        }
        return
      }

      toast.success(`Successfully enrolled in ${subject.name}!`)
      setEnrollCode("")
      setShowEnrollForm(false)
      await fetchAssignments() // Reload assignments
    } catch (err: any) {
      console.error("Enrollment exception:", err)
      setEnrollError("An unexpected error occurred.")
    } finally {
      setEnrolling(false)
    }
  }

  const filteredAssignments = assignments
    .filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.subjectName.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(a => selectedSubject === "all" ? true : a.subjectName === selectedSubject)
    .filter(a => selectedStatus === "all" ? true : a.status === selectedStatus)

  const getStatusColor = (status: AssignmentStatus) => {
    switch (status) {
      case "Not Started": return "bg-slate-100 text-slate-700 border-slate-200"
      case "Draft": return "bg-yellow-100 text-yellow-700 border-yellow-200"
      case "Submitted": return "bg-blue-100 text-blue-700 border-blue-200"
      case "Under Review": return "bg-purple-100 text-purple-700 border-purple-200"
      case "Approved": return "bg-green-100 text-green-700 border-green-200"
      case "Graded": return "bg-emerald-100 text-emerald-700 border-emerald-200"
      case "Returned": return "bg-red-100 text-red-700 border-red-200"
      default: return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateString))
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-5 w-64 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-[2rem]" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-[1.5rem]" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Assignments</h1>
          <p className="text-muted-foreground mt-1">
            {enrolledSubjectIds.length === 0
              ? "Showing assignments targeted to your academic profile."
              : `Showing assignments across ${enrolledSubjectIds.length} enrolled subject${enrolledSubjectIds.length !== 1 ? "s" : ""}.`}
          </p>
        </div>
        <Button
          className="h-11 rounded-2xl px-6 font-bold shadow-sm gap-2 flex-shrink-0"
          onClick={() => { setShowEnrollForm(v => !v); setEnrollError(null); setEnrollCode("") }}
        >
          <Plus className="h-4 w-4" /> Join a Subject
        </Button>
      </div>

      {/* Self-enrollment form */}
      {showEnrollForm && (
        <Card className="border-2 border-primary/20 shadow-sm rounded-[2rem] animate-in slide-in-from-top-2 duration-300">
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#0B1E43] flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" /> Join a Subject
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Enter the subject code given by your professor to enroll.
                </p>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => { setShowEnrollForm(false); setEnrollError(null) }}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleEnroll} className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Enter subject code (e.g. ML301)"
                value={enrollCode}
                onChange={e => { setEnrollCode(e.target.value); setEnrollError(null) }}
                className={`flex-1 h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 uppercase ${enrollError ? "ring-2 ring-red-400" : ""}`}
                disabled={enrolling}
              />
              <Button type="submit" disabled={enrolling || !enrollCode.trim()} className="h-12 rounded-2xl px-8 font-bold bg-[#1E5EFF] hover:bg-blue-700 flex-shrink-0">
                {enrolling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining...</> : "Join Subject"}
              </Button>
            </form>
            {enrollError && (
              <p className="mt-3 text-sm text-red-500 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {enrollError}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Filters — only show when there are assignments */}
      {assignments.length > 0 && (
        <Card className="border-none shadow-sm rounded-[2rem] bg-white">
          <CardContent className="p-6 flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assignments..."
                className="pl-11 h-12 bg-[#F4F7FE] border-none rounded-2xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-48">
                <select
                  className="w-full h-12 px-4 appearance-none bg-[#F4F7FE] border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                >
                  <option value="all">All Subjects</option>
                  {subjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                <Filter className="absolute right-4 top-4 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>

              <div className="relative flex-1 md:w-48">
                <select
                  className="w-full h-12 px-4 appearance-none bg-[#F4F7FE] border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="Draft">Draft</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Graded">Graded</option>
                  <option value="Returned">Returned</option>
                </select>
                <Filter className="absolute right-4 top-4 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignments List */}
      <div className="grid gap-4">
        {filteredAssignments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={searchQuery || selectedSubject !== "all" || selectedStatus !== "all" ? "No assignments match your filters" : "No assignments available for your year."}
            description={searchQuery || selectedSubject !== "all" || selectedStatus !== "all"
              ? "Try adjusting your filters or search query."
              : "Your professors have not posted any assignments for your year of study yet. Check back soon."}
          />
        ) : (
          filteredAssignments.map((assignment) => {
            const isOverdue = new Date(assignment.deadline) < new Date() && assignment.status === "Not Started"
            return (
              <Link key={assignment.id} to={`/student/assignments/${assignment.id}`}>
                <Card className={`border shadow-sm rounded-[1.5rem] hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group ${isOverdue ? "border-red-200 bg-red-50/30" : "border-muted/50"}`}>
                  <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">

                    <div className="flex gap-5 items-start flex-1">
                      <div className={`hidden sm:flex h-14 w-14 rounded-2xl items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform ${isOverdue ? "bg-red-100 text-red-600" : "bg-[#E6F0FF] text-[#1E5EFF]"}`}>
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-bold text-lg text-[#0B1E43] leading-tight group-hover:text-primary transition-colors">
                          {assignment.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="font-medium bg-muted/50 px-2.5 py-0.5 rounded-lg">{assignment.subjectName}</span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            Due {formatDate(assignment.deadline)}
                          </span>
                          {isOverdue && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-lg">Overdue</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                          <span>{assignment.maxMarks} Marks</span>
                          {(assignment.maxCredits ?? 0) > 0 && <span>· {assignment.maxCredits} Credits</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-0 pt-4 md:pt-0">
                      <div className="text-sm font-semibold flex flex-col items-start md:items-end">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">Points</span>
                        <span className="text-[#0B1E43]">
                          {assignment.marks !== undefined ? `${assignment.marks} / ` : ""}{assignment.maxMarks}
                        </span>
                      </div>
                      <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${getStatusColor(assignment.status)}`}>
                        {assignment.status}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors hidden md:block" />
                    </div>

                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </div>

    </div>
  )
}
