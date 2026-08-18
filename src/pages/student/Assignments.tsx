// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, Filter, FileText, Calendar, ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

type AssignmentStatus = "Not Started" | "Draft" | "Submitted" | "Under Review" | "Approved" | "Returned"

interface AssignmentData {
  id: string
  title: string
  subjectName: string
  subjectId: string
  deadline: string
  status: AssignmentStatus
  marks?: number
  maxMarks?: number
}

export default function StudentAssignments() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubject, setSelectedSubject] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  
  // Extracted unique subjects for the filter
  const subjects = Array.from(new Set(assignments.map(a => a.subjectName)))

  useEffect(() => {
    if (!profile) return

    const fetchAssignments = async () => {
      try {
        setLoading(true)
        
        // 1. Fetch enrolled subjects
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("subject_id")
          .eq("student_id", profile.id)

        const subjectIds = enrollments?.map(e => e.subject_id) || []
        if (subjectIds.length === 0) {
          setAssignments([])
          setLoading(false)
          return
        }

        // 2. Fetch all assignments for those subjects
        const { data: allAssignments } = (await supabase
          .from("assignments")
          .select("id, title, deadline, max_marks, subject_id, subjects(name)")
          .in("subject_id" as any, subjectIds)) as any

        // 3. Fetch all submissions for this student
        const { data: submissions } = (await supabase
          .from("submissions")
          .select("assignment_id, status")
          .eq("student_id" as any, profile.id)) as any

        // 4. Fetch grades
        const { data: grades } = await supabase
          .from("grades")
          .select("submission_id, marks, submissions(assignment_id)")

        const submissionMap = new Map()
        submissions?.forEach(sub => {
          submissionMap.set(sub.assignment_id, sub.status)
        })

        const gradeMap = new Map()
        grades?.forEach(g => {
          if (g.submissions && typeof g.submissions === 'object' && 'assignment_id' in g.submissions) {
            gradeMap.set((g.submissions as any).assignment_id, g.marks)
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

          return {
            id: a.id,
            title: a.title,
            subjectName: (a.subjects as any)?.name || "Unknown Subject",
            subjectId: a.subject_id as string,
            deadline: a.deadline,
            status,
            maxMarks: a.max_marks || 100,
            marks: gradeMap.get(a.id)
          }
        })

        setAssignments(formattedAssignments)

      } catch (error) {
        console.error("Error fetching assignments:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAssignments()
  }, [profile])

  const filteredAssignments = assignments
    .filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.subjectName.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(a => selectedSubject === "all" ? true : a.subjectName === selectedSubject)
    .filter(a => selectedStatus === "all" ? true : a.status === selectedStatus)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

  const getStatusColor = (status: AssignmentStatus) => {
    switch (status) {
      case "Not Started": return "bg-slate-100 text-slate-700 border-slate-200"
      case "Draft": return "bg-yellow-100 text-yellow-700 border-yellow-200"
      case "Submitted": return "bg-blue-100 text-blue-700 border-blue-200"
      case "Under Review": return "bg-purple-100 text-purple-700 border-purple-200"
      case "Approved": return "bg-green-100 text-green-700 border-green-200"
      case "Returned": return "bg-red-100 text-red-700 border-red-200"
      default: return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
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
          <p className="text-muted-foreground mt-1">Manage and track all your coursework.</p>
        </div>
      </div>

      {/* Filters */}
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
                <option value="Returned">Returned</option>
              </select>
              <Filter className="absolute right-4 top-4 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignments List */}
      <div className="grid gap-4">
        {filteredAssignments.length === 0 ? (
          <EmptyState 
            icon={FileText} 
            title="No assignments found" 
            description="Try adjusting your filters or search query." 
          />
        ) : (
          filteredAssignments.map((assignment) => (
            <Link key={assignment.id} to={`/student/assignments/${assignment.id}`}>
              <Card className="border border-muted/50 shadow-sm rounded-[1.5rem] hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group">
                <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  
                  <div className="flex gap-5 items-start flex-1">
                    <div className="hidden sm:flex h-14 w-14 rounded-2xl bg-[#E6F0FF] text-[#1E5EFF] items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
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
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-0 pt-4 md:pt-0">
                    <div className="text-sm font-semibold flex flex-col items-start md:items-end">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider">Points</span>
                      <span className="text-[#0B1E43]">
                        {assignment.marks !== undefined ? `${assignment.marks} / ` : ''}{assignment.maxMarks}
                      </span>
                    </div>
                    <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${getStatusColor(assignment.status)}`}>
                      {assignment.status}
                    </div>
                  </div>

                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

    </div>
  )
}
