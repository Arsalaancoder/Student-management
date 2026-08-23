// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search, FileText, CheckCircle, Clock, Filter, AlertCircle, RefreshCw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Link, useSearchParams } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface AssignmentOption {
  id: string
  title: string
}

interface SubmissionData {
  id: string
  assignmentId: string
  studentName: string
  studentId: string
  department: string
  rawDepartment: string | null
  year: string
  rawYear: number | null
  section: string
  rawSection: string | null
  profilePhoto: string | null
  assignmentTitle: string
  subjectName: string
  status: string
  submittedAt: string
}

export default function ProfessorAllSubmissions() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [myAssignments, setMyAssignments] = useState<AssignmentOption[]>([])

  // Filter states initialized from URL search params if present
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssignment, setSelectedAssignment] = useState("all")
  const [selectedBranch, setSelectedBranch] = useState(searchParams.get("branch") || "all")
  const [selectedYear, setSelectedYear] = useState(searchParams.get("year") || "all")
  const [selectedSection, setSelectedSection] = useState(searchParams.get("section") || "all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  const fetchSubmissions = async () => {
    if (!profile) return
    try {
      setLoading(true)

      // 1. Fetch all assignments created by this professor
      const { data: assignmentsData, error: assignErr } = await supabase
        .from("assignments")
        .select("id, title")
        .eq("created_by", profile.id)

      if (assignErr) throw assignErr

      setMyAssignments(assignmentsData || [])
      const assignmentIds = (assignmentsData || []).map(a => a.id)

      if (assignmentIds.length > 0) {
        // 2. Fetch all submissions joined with profiles, assignments, and grades
        const { data: subsData, error: subsErr } = await supabase
          .from("submissions")
          .select(`
            id,
            assignment_id,
            status,
            submitted_at,
            profiles:student_id (
              id,
              full_name,
              email,
              student_id,
              department,
              year,
              section,
              profile_photo_url
            ),
            assignments:assignment_id (
              id,
              title,
              max_marks,
              max_credits,
              subject_name,
              subjects (name)
            ),
            grades (
              marks,
              credits,
              feedback
            )
          `)
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false })

        if (subsErr) throw subsErr

        const formatted: SubmissionData[] = (subsData || []).map((s: any) => {
          const p = s.profiles || {}
          const a = s.assignments || {}
          const g = (Array.isArray(s.grades) ? s.grades[0] : s.grades) || {}
          const name = p.full_name || p.email || (p.student_id ? `Student (${p.student_id})` : "Student Profile")
          
          return {
            id: s.id,
            assignmentId: s.assignment_id,
            studentName: name,
            studentId: p.student_id || "N/A",
            department: p.department || "Not provided",
            rawDepartment: p.department,
            year: p.year ? `${p.year}${p.year === 1 ? 'st' : p.year === 2 ? 'nd' : p.year === 3 ? 'rd' : 'th'} Year` : "Not provided",
            rawYear: p.year,
            section: p.section ? `Section ${p.section}` : "Not provided",
            rawSection: p.section,
            profilePhoto: p.profile_photo_url || null,
            assignmentTitle: a.title || "Assignment",
            subjectName: a.subject_name || (a.subjects as any)?.name || "General",
            maxMarks: a.max_marks || 100,
            maxCredits: a.max_credits || 0,
            status: s.status || "submitted",
            submittedAt: s.submitted_at,
            marks: g.marks !== undefined && g.marks !== null ? Number(g.marks) : null,
            credits: g.credits !== undefined && g.credits !== null ? Number(g.credits) : null,
            feedback: g.feedback || null
          }
        })

        setSubmissions(formatted)
      } else {
        setSubmissions([])
      }
    } catch (error) {
      console.error("Error fetching submissions:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [profile])

  // Multi-field Filtering Logic
  const filteredSubmissions = submissions.filter(s => {
    // 1. Text Search Query
    const matchesSearch = !searchQuery.trim() ||
      s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.assignmentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subjectName.toLowerCase().includes(searchQuery.toLowerCase())

    // 2. Assignment Filter
    const matchesAssignment = selectedAssignment === "all" || s.assignmentId === selectedAssignment

    // 3. Branch Filter
    const matchesBranch = selectedBranch === "all" || (s.rawDepartment && s.rawDepartment.toLowerCase() === selectedBranch.toLowerCase())

    // 4. Year Filter
    const matchesYear = selectedYear === "all" || String(s.rawYear) === String(selectedYear)

    // 5. Section Filter
    const matchesSection = selectedSection === "all" || (s.rawSection && s.rawSection.toUpperCase() === selectedSection.toUpperCase())

    // 6. Status Filter
    const matchesStatus = selectedStatus === "all" || (
      selectedStatus === "pending" ? (s.status === "submitted" || s.status === "under_review") :
        s.status === selectedStatus
    )

    return matchesSearch && matchesAssignment && matchesBranch && matchesYear && matchesSection && matchesStatus
  })

  const resetFilters = () => {
    setSearchQuery("")
    setSelectedAssignment("all")
    setSelectedBranch("all")
    setSelectedYear("all")
    setSelectedSection("all")
    setSelectedStatus("all")
  }

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto pb-10">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <Skeleton className="h-5 w-80 rounded-lg" />
          </div>
          <Skeleton className="h-11 w-72 rounded-2xl" />
        </div>
        <Skeleton className="h-[600px] w-full rounded-[2rem]" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Submissions</h1>
          <p className="text-muted-foreground mt-1">Review student work across all your assigned classes.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search student, ID, or subject..."
            className="pl-9 bg-white border-muted/50 rounded-2xl h-11 focus-visible:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Controls Bar */}
      <Card className="border-none shadow-sm rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#1E5EFF]" />
            <h3 className="font-bold text-[#0B1E43] text-sm uppercase tracking-wider">Filter Submissions</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-xs text-slate-500 hover:text-slate-900 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset Filters
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Assignment Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Assignment</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Assignments</option>
              {myAssignments.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          {/* Branch Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Branches</option>
              <option value="Computer Science & Engineering">CSE</option>
              <option value="Information Technology">IT</option>
              <option value="Electronics & Communication">ECE</option>
              <option value="Electrical & Electronics">EEE</option>
              <option value="Mechanical Engineering">MECH</option>
              <option value="Civil Engineering">CIVIL</option>
              <option value="AI & ML">AI & ML</option>
              <option value="Data Science">Data Science (AI&DS)</option>
              <option value="Ai&Ds">Ai&Ds</option>
            </select>
          </div>

          {/* Year Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          {/* Section Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
              <option value="E">Section E</option>
              <option value="F">Section F</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="graded">Graded</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="returned">Returned</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Submissions List */}
      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardHeader className="p-8 pb-4 border-b border-muted/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Submissions ({filteredSubmissions.length})</CardTitle>
            <CardDescription>Filtered student submissions for your assignments.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSubmissions.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={FileText}
                title="No submissions found"
                description="Try adjusting your filters or search query."
              />
            </div>
          ) : (
            <div className="divide-y divide-muted/50">
              {filteredSubmissions.map((sub) => {
                const needsReview = sub.status === "submitted" || sub.status === "under_review"

                return (
                  <div key={sub.id} className="flex flex-col lg:flex-row lg:items-center justify-between p-6 hover:bg-slate-50 transition-colors gap-4">
                    <div className="flex items-start sm:items-center gap-4 min-w-0">
                      <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 overflow-hidden border border-slate-100 shadow-2xs">
                        {sub.profilePhoto ? (
                          <img src={sub.profilePhoto} alt={sub.studentName} className="h-full w-full object-cover" />
                        ) : (
                          <span>{sub.studentName.charAt(0)}</span>
                        )}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-[#0B1E43] text-lg leading-snug truncate">{sub.studentName}</h4>
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg uppercase tracking-wider">ID: {sub.studentId}</span>
                        </div>

                        {/* Student Academic Info */}
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground flex-wrap">
                          <span className="text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">{sub.department}</span>
                          <span>&bull;</span>
                          <span className="text-slate-700 font-medium">{sub.year}</span>
                          <span>&bull;</span>
                          <span className="text-slate-700 font-medium">{sub.section}</span>
                        </div>

                        {/* Assignment Details */}
                        <div className="flex items-center gap-2 text-sm pt-0.5 flex-wrap">
                          <span className="font-bold text-[#1E5EFF]">{sub.assignmentTitle}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="font-medium text-slate-600">{sub.subjectName}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="text-muted-foreground">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                      <div className="min-w-[120px]">
                        {needsReview ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-100 text-orange-700 uppercase tracking-wider w-fit">
                            <Clock className="h-3.5 w-3.5" /> Pending Review
                          </span>
                        ) : sub.status === "returned" ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-100 text-red-700 uppercase tracking-wider w-fit">
                            <AlertCircle className="h-3.5 w-3.5" /> Returned
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-green-100 text-green-700 uppercase tracking-wider w-fit">
                            <CheckCircle className="h-3.5 w-3.5" /> Graded
                          </span>
                        )}
                      </div>

                      <Button asChild className={`rounded-xl font-bold shadow-sm ${needsReview ? 'bg-[#1E5EFF] hover:bg-blue-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                        <Link to={`/professor/submissions/${sub.id}/review`}>
                          {needsReview ? 'Review' : 'View Grade'}
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

