// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, FileText, Users, Clock, ArrowRight, Loader2, Calendar } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Link, useNavigate } from "react-router-dom"

interface AssignmentData {
  id: string
  title: string
  subjectName: string
  deadline: string
  maxMarks: number
  maxCredits: number
  targetYear: number | null
  submissionsCount: number
  pendingReviewsCount: number
}

export default function ProfessorAssignments() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!profile) return

    const fetchAssignments = async () => {
      try {
        setLoading(true)
        
        // Fetch assignments
        const { data: assignmentsData, error } = await supabase
          .from("assignments")
          .select(`
            id,
            title,
            deadline,
            max_marks,
            max_credits,
            target_year,
            subject_name,
            subjects (name)
          `)
          .eq("created_by", profile.id)
          .order("deadline", { ascending: false })

        if (error) throw error

        if (assignmentsData && assignmentsData.length > 0) {
          const assignmentIds = assignmentsData.map(a => a.id)
          
          // Fetch submissions to get counts
          const { data: submissionsData } = await supabase
            .from("submissions")
            .select("assignment_id, status")
            .in("assignment_id", assignmentIds)

          const subCountMap: Record<string, number> = {}
          const pendingCountMap: Record<string, number> = {}

          submissionsData?.forEach(s => {
            if (s.assignment_id) {
              subCountMap[s.assignment_id] = (subCountMap[s.assignment_id] || 0) + 1
              if (s.status === "submitted") {
                pendingCountMap[s.assignment_id] = (pendingCountMap[s.assignment_id] || 0) + 1
              }
            }
          })

          const formatted = assignmentsData.map(a => ({
            id: a.id,
            title: a.title,
            subjectName: a.subject_name || (a.subjects as any)?.name || "General",
            deadline: a.deadline,
            maxMarks: a.max_marks || 100,
            maxCredits: a.max_credits || 0,
            targetYear: a.target_year ?? null,
            submissionsCount: subCountMap[a.id] || 0,
            pendingReviewsCount: pendingCountMap[a.id] || 0
          }))

          setAssignments(formatted)
        }
      } catch (error) {
        console.error("Error fetching assignments:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAssignments()
  }, [profile])

  const filteredAssignments = assignments.filter(a => 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.subjectName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatYearLabel = (year: number | null) => {
    if (!year) return "All Years"
    switch (year) {
      case 1: return "1st Year"
      case 2: return "2nd Year"
      case 3: return "3rd Year"
      case 4: return "4th Year"
      default: return `${year}th Year`
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <Skeleton className="h-5 w-80 rounded-lg" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-11 w-64 rounded-2xl" />
            <Skeleton className="h-11 w-40 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-[2rem]" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Assignments Management</h1>
          <p className="text-muted-foreground mt-1">Create, edit, and track assignment progress across your classes.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search assignments..." 
              className="pl-9 bg-white border-muted/50 rounded-2xl h-11 focus-visible:ring-primary/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button asChild className="h-11 rounded-2xl px-6 font-bold shadow-sm">
            <Link to="/professor/assignments/create">
              <Plus className="mr-2 h-4 w-4" /> Create Assignment
            </Link>
          </Button>
        </div>
      </div>

      {filteredAssignments.length === 0 ? (
        <EmptyState 
          icon={FileText} 
          title="No assignments found" 
          description="You haven't created any assignments yet or none match your search." 
          action={{ label: "Create your first assignment", onClick: () => navigate('/professor/assignments/create') }}
        />
      ) : (
        <div className="grid gap-4">
          {filteredAssignments.map((assignment) => {
            const isPastDue = new Date(assignment.deadline) < new Date()
            
            return (
              <Card key={assignment.id} className="border-none shadow-sm rounded-3xl overflow-hidden group hover:shadow-md transition-all">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    
                    {/* Main Info */}
                    <div className="flex-1 p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="px-3 py-1 bg-muted text-muted-foreground rounded-lg text-xs font-bold tracking-wide uppercase">
                          {assignment.subjectName}
                        </span>
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold tracking-wide">
                          For: {formatYearLabel(assignment.targetYear)}
                        </span>
                        <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg ${isPastDue ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                          <Calendar className="h-3.5 w-3.5" />
                          {isPastDue ? 'Closed' : 'Active'} &bull; Due {new Date(assignment.deadline).toLocaleDateString()}
                        </span>
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg">
                          Published
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-[#0B1E43] mb-1">{assignment.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                        <span>{assignment.maxMarks} Marks</span>
                        <span>&bull;</span>
                        <span>{assignment.maxCredits} Credits</span>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="flex flex-col sm:flex-row items-center border-t md:border-t-0 md:border-l border-muted/50 bg-slate-50/50">
                      
                      <div className="flex gap-8 p-6 md:p-8 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-muted/50">
                        <div className="flex flex-col items-center">
                          <Users className="h-5 w-5 text-blue-500 mb-2" />
                          <span className="text-2xl font-extrabold text-[#0B1E43]">{assignment.submissionsCount}</span>
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Submitted</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <Clock className={`h-5 w-5 mb-2 ${assignment.pendingReviewsCount > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                          <span className={`text-2xl font-extrabold ${assignment.pendingReviewsCount > 0 ? 'text-orange-600' : 'text-[#0B1E43]'}`}>{assignment.pendingReviewsCount}</span>
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">To Review</span>
                        </div>
                      </div>

                      <div className="p-6 md:p-8 w-full sm:w-auto flex items-center justify-center">
                        <Button asChild className="w-full sm:w-auto rounded-xl shadow-sm font-bold bg-[#1E5EFF] hover:bg-blue-700">
                          <Link to={`/professor/assignments/${assignment.id}/submissions`}>
                            Manage <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>

                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

    </div>
  )
}
