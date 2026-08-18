// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search, FileText, CheckCircle, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface SubmissionData {
  id: string
  studentName: string
  assignmentTitle: string
  subjectName: string
  status: string
  submittedAt: string
}

export default function ProfessorAllSubmissions() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!profile) return

    const fetchSubmissions = async () => {
      try {
        setLoading(true)

        // 1. Get all my assignments
        const { data: myAssignments } = await supabase
          .from("assignments")
          .select("id")
          .eq("created_by", profile.id)

        const assignmentIds = myAssignments?.map(a => a.id) || []

        if (assignmentIds.length > 0) {
          // 2. Fetch all submissions for these assignments
          const { data: subsData, error } = await supabase
            .from("submissions")
            .select(`
              id,
              status,
              submitted_at,
              profiles:student_id (full_name),
              assignments (
                title,
                subjects (name)
              )
            `)
            .in("assignment_id", assignmentIds)
            .order("submitted_at", { ascending: false })

          if (error) throw error

          const formatted = (subsData || []).map((s: any) => ({
            id: s.id,
            studentName: s.profiles?.full_name || "Unknown Student",
            assignmentTitle: s.assignments?.title || "Unknown Assignment",
            subjectName: (s.assignments?.subjects as any)?.name || "Unknown Subject",
            status: s.status || "submitted",
            submittedAt: s.submitted_at
          }))

          setSubmissions(formatted)
        }

      } catch (error) {
        console.error("Error fetching all submissions:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubmissions()
  }, [profile])

  const filteredSubmissions = submissions.filter(s => 
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.assignmentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.subjectName.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">All Submissions</h1>
          <p className="text-muted-foreground mt-1">Review student work across all your classes.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search student or assignment..." 
            className="pl-9 bg-white border-muted/50 rounded-2xl h-11 focus-visible:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardHeader className="p-8 pb-4 border-b border-muted/50">
          <CardTitle className="text-xl">Recent Activity</CardTitle>
          <CardDescription>All student submissions ordered by most recent.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSubmissions.length === 0 ? (
            <div className="p-12">
              <EmptyState 
                icon={FileText} 
                title="No submissions found" 
                description="Try adjusting your search criteria." 
              />
            </div>
          ) : (
            <div className="divide-y divide-muted/50">
              {filteredSubmissions.map((sub) => {
                const needsReview = sub.status === "submitted"
                
                return (
                  <div key={sub.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {sub.studentName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#0B1E43] text-lg">{sub.studentName}</h4>
                        <div className="flex items-center gap-2 text-sm mt-0.5 flex-wrap">
                          <span className="font-medium text-[#1E5EFF]">{sub.assignmentTitle}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="text-muted-foreground">{sub.subjectName}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="text-muted-foreground">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 mt-4 md:mt-0 pl-16 md:pl-0">
                      <div className="min-w-[120px]">
                        {needsReview ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-100 text-orange-700 uppercase tracking-wider w-fit">
                            <Clock className="h-3.5 w-3.5" /> Needs Review
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
