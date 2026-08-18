// @ts-nocheck
import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  ArrowLeft, Plus, FileText, Users, Clock, Calendar, 
  CheckCircle2, AlertCircle, Loader2 
} from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface Subject {
  id: string
  name: string
  code: string
  description: string | null
  professor_id: string
}

interface Assignment {
  id: string
  title: string
  description: string | null
  deadline: string
  max_marks: number
  max_credits: number
  created_at: string
  submissionCount?: number
}

export default function ProfessorSubjectDetail() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [enrolledCount, setEnrolledCount] = useState(0)

  useEffect(() => {
    if (!profile || !subjectId) return
    fetchData()
  }, [profile, subjectId])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch subject — verify it belongs to this professor
      const { data: subjectData, error: subError } = await supabase
        .from("subjects")
        .select("*")
        .eq("id", subjectId)
        .eq("professor_id", profile.id)
        .single()

      if (subError || !subjectData) {
        toast.error("Subject not found or access denied.")
        navigate("/professor/subjects")
        return
      }

      setSubject(subjectData)

      // Fetch assignments for this subject
      const { data: assignmentsData } = await supabase
        .from("assignments")
        .select("id, title, description, deadline, max_marks, max_credits, created_at")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })

      // Fetch submission counts
      if (assignmentsData && assignmentsData.length > 0) {
        const assignmentIds = assignmentsData.map(a => a.id)
        const { data: submissionsData } = await supabase
          .from("submissions")
          .select("assignment_id")
          .in("assignment_id", assignmentIds)

        const subCountMap: Record<string, number> = {}
        submissionsData?.forEach(s => {
          if (s.assignment_id) subCountMap[s.assignment_id] = (subCountMap[s.assignment_id] || 0) + 1
        })

        setAssignments(assignmentsData.map(a => ({
          ...a,
          submissionCount: subCountMap[a.id] || 0
        })))
      } else {
        setAssignments([])
      }

      // Fetch enrolled student count
      const { count } = await supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .eq("subject_id", subjectId)

      setEnrolledCount(count || 0)

    } catch (err) {
      console.error("Error fetching subject details:", err)
      toast.error("Failed to load subject details")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-10">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-[2rem]" />
        <Skeleton className="h-64 w-full rounded-[2rem]" />
      </div>
    )
  }

  if (!subject) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Subject not found"
        description="This subject does not exist or you do not have permission to view it."
        action={{ label: "Back to Subjects", onClick: () => navigate("/professor/subjects") }}
      />
    )
  }

  const now = new Date()

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-5xl mx-auto">
      
      {/* Back button */}
      <Button variant="ghost" className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground" onClick={() => navigate("/professor/subjects")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Subjects
      </Button>

      {/* Subject Info Card */}
      <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-[#1E5EFF] to-[#8BB1FF]" />
        <CardHeader className="p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg tracking-wider">{subject.code}</span>
              <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43] mt-3">{subject.name}</h1>
              {subject.description && (
                <p className="text-muted-foreground mt-2 max-w-2xl">{subject.description}</p>
              )}
            </div>
            <Button asChild className="rounded-2xl px-6 font-bold bg-[#1E5EFF] hover:bg-blue-700 flex-shrink-0 gap-2">
              <Link to={`/professor/subjects/${subject.id}/assignments/create`}>
                <Plus className="h-4 w-4" /> Create Assignment
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <div className="flex gap-6">
            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Enrolled Students</span>
                <span className="font-bold text-[#0B1E43] text-lg">{enrolledCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Assignments</span>
                <span className="font-bold text-[#0B1E43] text-lg">{assignments.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignments List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#0B1E43]">Assignments</h2>
          <Button asChild variant="outline" className="rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/5">
            <Link to={`/professor/subjects/${subject.id}/assignments/create`}>
              <Plus className="h-4 w-4" /> Add Assignment
            </Link>
          </Button>
        </div>

        {assignments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No assignments yet"
            description="Create your first assignment for this subject."
            action={{ label: "Create Assignment", onClick: () => navigate(`/professor/subjects/${subject.id}/assignments/create`) }}
          />
        ) : (
          <div className="space-y-4">
            {assignments.map(assignment => {
              const isOverdue = new Date(assignment.deadline) < now
              const isPastDue = isOverdue

              return (
                <Card key={assignment.id} className="border border-muted/50 shadow-sm rounded-[1.5rem] hover:shadow-md hover:border-primary/20 transition-all group">
                  <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex gap-5 items-start flex-1">
                      <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-[#E6F0FF] text-[#1E5EFF] items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg text-[#0B1E43] group-hover:text-primary transition-colors">
                          {assignment.title}
                        </h3>
                        {assignment.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{assignment.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Due {new Date(assignment.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${isPastDue ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            {isPastDue ? 'Closed' : 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 border-t md:border-0 pt-4 md:pt-0 w-full md:w-auto justify-between md:justify-end">
                      <div className="flex gap-6">
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-extrabold text-[#0B1E43]">{assignment.submissionCount || 0}</span>
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Submissions</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-extrabold text-[#0B1E43]">{assignment.max_marks}</span>
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Marks</span>
                        </div>
                      </div>
                      <Button asChild className="rounded-xl bg-[#1E5EFF] hover:bg-blue-700 font-bold">
                        <Link to={`/professor/assignments/${assignment.id}/submissions`}>
                          Manage
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
