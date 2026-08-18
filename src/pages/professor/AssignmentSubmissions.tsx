// @ts-nocheck
import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Search, FileText, CheckCircle, Clock, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import AIPanel from "@/components/ai/AIPanel"
import { invokeAIAssistant } from "@/lib/ai"

interface SubmissionData {
  id: string
  studentName: string
  studentId: string
  status: string
  submittedAt: string
  similarityScore: number | null
}

interface AssignmentInfo {
  title: string
  subjectName: string
  maxMarks: number
  deadline: string
}

export default function AssignmentSubmissions() {
  const { id } = useParams()
  const { profile } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!profile || !id) return

    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch Assignment Details
        const { data: assignData, error: assignError } = await supabase
          .from("assignments")
          .select("title, max_marks, deadline, subjects(name)")
          .eq("id", id)
          .single()

        if (assignError) throw assignError

        setAssignment({
          title: assignData.title,
          subjectName: (assignData.subjects as any)?.name || "Unknown Subject",
          maxMarks: assignData.max_marks || 100,
          deadline: assignData.deadline
        })

        // Fetch Submissions
        const { data: subsData, error: subsError } = await supabase
          .from("submissions")
          .select(`
            id,
            status,
            submitted_at,
            similarity_score,
            profiles:student_id (full_name, student_id)
          `)
          .eq("assignment_id", id)
          .order("submitted_at", { ascending: false })

        if (subsError) throw subsError

        const formatted = (subsData || []).map((s: any) => ({
          id: s.id,
          studentName: s.profiles?.full_name || "Unknown Student",
          studentId: s.profiles?.student_id || "N/A",
          status: s.status || "submitted",
          submittedAt: s.submitted_at,
          similarityScore: s.similarity_score
        }))

        setSubmissions(formatted)

      } catch (error) {
        console.error("Error fetching submissions:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile, id])

  const filteredSubmissions = submissions.filter(s => 
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const [classSummaryContent, setClassSummaryContent] = useState<string | null>(null)
  const [classSummaryLoading, setClassSummaryLoading] = useState(false)
  const [classSummaryError, setClassSummaryError] = useState<string | null>(null)

  const handleClassSummary = async () => {
    if (!assignment || submissions.length === 0) return
    
    try {
      setClassSummaryLoading(true)
      setClassSummaryError(null)
      
      const stats = {
        totalSubmissions: submissions.length,
        graded: submissions.filter(s => s.status !== 'submitted').length,
        pending: submissions.filter(s => s.status === 'submitted').length,
        avgSimilarity: submissions.reduce((acc, curr) => acc + (curr.similarityScore || 0), 0) / submissions.length
      }

      const result = await invokeAIAssistant('class_summary', {
        title: assignment.title,
        stats
      })
      setClassSummaryContent(result)
    } catch (err: any) {
      setClassSummaryError(err.message)
    } finally {
      setClassSummaryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-muted">
          <Link to="/professor/assignments"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold tracking-wide uppercase">
              {assignment?.subjectName}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">{assignment?.title}</h1>
          <p className="text-muted-foreground mt-1">Manage and grade student submissions.</p>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardHeader className="p-8 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-muted/50">
          <div>
            <CardTitle className="text-xl">Submissions ({submissions.length})</CardTitle>
            <CardDescription>Click on a student's submission to review and grade.</CardDescription>
          </div>
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2 shrink-0" onClick={handleClassSummary} disabled={classSummaryLoading || submissions.length === 0}>
              <Sparkles className="h-4 w-4" /> Summarize Class
            </Button>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by student name or ID..." 
                className="pl-9 bg-slate-50 border-none rounded-2xl h-11 focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(classSummaryContent || classSummaryLoading || classSummaryError) && (
            <div className="p-6 border-b border-muted/50 bg-indigo-50/30">
              <AIPanel 
                title="Class Performance Summary"
                content={classSummaryContent} 
                loading={classSummaryLoading} 
                error={classSummaryError} 
                onClose={() => {setClassSummaryContent(null); setClassSummaryError(null)}}
                onRegenerate={handleClassSummary}
              />
            </div>
          )}
          {filteredSubmissions.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-b-[2rem]">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-bold text-[#0B1E43]">No submissions found</h3>
              <p className="text-muted-foreground mt-2">There are no submissions matching your search criteria yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-muted/50">
              {filteredSubmissions.map((sub) => {
                const needsReview = sub.status === "submitted"
                
                return (
                  <div key={sub.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {sub.studentName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#0B1E43] text-lg">{sub.studentName}</h4>
                        <div className="flex items-center gap-3 text-sm mt-0.5">
                          <span className="text-muted-foreground font-medium">ID: {sub.studentId}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="text-muted-foreground">Submitted {new Date(sub.submittedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 mt-4 md:mt-0 pl-16 md:pl-0">
                      {/* Similarity Score Badge */}
                      {sub.similarityScore !== null && (
                        <div className={`px-3 py-1 rounded-xl text-xs font-bold flex flex-col items-center ${sub.similarityScore > 30 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                          <span>{sub.similarityScore}%</span>
                          <span className="text-[10px] opacity-80 uppercase tracking-wider">Similarity</span>
                        </div>
                      )}

                      {/* Status */}
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

                      {/* Action */}
                      <Button asChild className={`rounded-xl font-bold shadow-sm ${needsReview ? 'bg-[#1E5EFF] hover:bg-blue-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                        <Link to={`/professor/submissions/${sub.id}/review`}>
                          {needsReview ? 'Grade Now' : 'View Grade'}
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
