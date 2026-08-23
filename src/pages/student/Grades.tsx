// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { TrendingUp, Award, Calendar, ChevronRight, CheckCircle2, Zap, AlertCircle, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"

interface GradeData {
  id: string
  marks: number
  credits: number
  feedback: string
  gradedAt: string
  assignmentId: string
  assignmentTitle: string
  maxMarks: number
  subjectName: string
  professorName: string
  letterGrade: string
}

export default function StudentGrades() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [grades, setGrades] = useState<GradeData[]>([])
  
  // Stats
  const [averagePercentage, setAveragePercentage] = useState(0)
  const [totalEarnedMarks, setTotalEarnedMarks] = useState(0)
  const [totalPossibleMarks, setTotalPossibleMarks] = useState(0)
  const [totalEarnedCredits, setTotalEarnedCredits] = useState(0)

  const fetchGrades = async () => {
    if (!profile) return

    try {
      setLoading(true)
      setFetchError(null)
      
      // Fetch all grades for this student through submissions
      const { data: gradesData, error } = await supabase
        .from("grades")
        .select(`
          id,
          marks,
          credits,
          feedback,
          graded_at,
          profiles:professor_id (full_name),
          submissions!inner (
            student_id,
            assignments (
              id,
              title,
              max_marks,
              subjects (name)
            )
          )
        `)
        .eq("submissions.student_id" as any, profile.id)
        .order("graded_at", { ascending: false })

      if (error) throw error

      let earnedMarks = 0
      let possibleMarks = 0
      let earnedCredits = 0

      const formattedGrades: GradeData[] = (gradesData || []).map((g: any) => {
        const marks = Number(g.marks) || 0
        const credits = Number(g.credits) || 0
        const maxMarks = g.submissions?.assignments?.max_marks || 100
        
        earnedMarks += marks
        possibleMarks += maxMarks
        earnedCredits += credits

        const percentage = maxMarks > 0 ? (marks / maxMarks) * 100 : 0
        let letterGrade = "F"
        if (percentage >= 90) letterGrade = "A"
        else if (percentage >= 80) letterGrade = "B"
        else if (percentage >= 70) letterGrade = "C"
        else if (percentage >= 60) letterGrade = "D"

        return {
          id: g.id,
          marks,
          credits,
          feedback: g.feedback || "",
          gradedAt: g.graded_at,
          assignmentId: g.submissions?.assignments?.id || "",
          assignmentTitle: g.submissions?.assignments?.title || "Assignment",
          maxMarks,
          subjectName: g.submissions?.assignments?.subjects?.name || "General Subject",
          professorName: g.profiles?.full_name || "Faculty Member",
          letterGrade
        }
      })

      setGrades(formattedGrades)
      setTotalEarnedMarks(earnedMarks)
      setTotalPossibleMarks(possibleMarks)
      setTotalEarnedCredits(earnedCredits)
      setAveragePercentage(possibleMarks > 0 ? (earnedMarks / possibleMarks) * 100 : 0)

    } catch (error: any) {
      console.error("Error fetching grades:", error)
      setFetchError(error.message || "Unable to load your grades. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGrades()

    if (!profile) return

    // Realtime listener for grade edits
    const channel = supabase
      .channel('realtime-grades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, () => {
        fetchGrades()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  if (loading) {
    return (
      <div className="space-y-8 pb-10 max-w-7xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48 rounded-lg" />
          <Skeleton className="h-5 w-64 rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-[180px] w-full rounded-[2rem]" />
          <Skeleton className="h-[180px] w-full rounded-[2rem]" />
          <Skeleton className="h-[180px] w-full rounded-[2rem]" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-[2rem]" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="space-y-8 pb-10 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Grades & Academic Performance</h1>
          <p className="text-muted-foreground mt-1">Track your scores and professor feedback.</p>
        </div>
        
        <Card className="border-none shadow-sm rounded-[2rem] bg-rose-50 border-rose-100 p-8 text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-rose-100 rounded-full text-rose-600">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-[#0B1E43]">Unable to load your grades</h2>
            <p className="text-sm text-slate-600 max-w-md">{fetchError}</p>
            <Button 
              onClick={fetchGrades}
              className="rounded-full px-6 font-bold gap-2 bg-[#1E5EFF] hover:bg-[#1E5EFF]/90"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Grades & Academic Performance</h1>
        <p className="text-muted-foreground mt-1">Track your scores and professor feedback.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Cumulative Average Card */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-gradient-to-br from-[#1E5EFF] to-[#0A2540] text-white">
          <CardContent className="p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-white/80">
                <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <span className="font-bold">Cumulative Average</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-extrabold">{averagePercentage.toFixed(1)}</span>
                <span className="text-xl font-medium text-white/60">%</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm font-medium">
                <span className="text-white/60">Total Points</span>
                <span>{totalEarnedMarks} / {totalPossibleMarks}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Graded Assignments Count Card */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white">
          <CardContent className="p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-slate-500">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <span className="font-bold text-[#0B1E43]">Graded Submissions</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-extrabold text-[#0B1E43]">{grades.length}</span>
                <span className="text-sm font-semibold text-muted-foreground uppercase">Evaluated</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm font-medium text-slate-500">
                <span>Academic Record</span>
                <span className="text-indigo-600 font-bold">Verified</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credits Earned Card */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white">
          <CardContent className="p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-slate-500">
                <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
                  <Zap className="h-6 w-6" />
                </div>
                <span className="font-bold text-[#0B1E43]">Credits Earned</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-extrabold text-[#0B1E43]">{totalEarnedCredits}</span>
                <span className="text-sm font-semibold text-muted-foreground uppercase">Credits</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm font-medium text-slate-500">
                <span>Credit Wallet</span>
                <Link to="/student/credits" className="text-primary font-bold hover:underline flex items-center">
                  View Wallet <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade History Section */}
      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="text-xl">Grade History</CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {grades.length === 0 ? (
            <EmptyState 
              icon={Award} 
              title="No grades available yet." 
              description="Your grades will appear here after your professor reviews and grades your submissions." 
            />
          ) : (
            <div className="space-y-4">
              {grades.map((grade) => {
                let badgeColor = "bg-green-100 text-green-700 border-green-200"
                if (grade.letterGrade === "B") badgeColor = "bg-blue-100 text-blue-700 border-blue-200"
                else if (grade.letterGrade === "C") badgeColor = "bg-yellow-100 text-yellow-700 border-yellow-200"
                else if (grade.letterGrade === "D" || grade.letterGrade === "F") badgeColor = "bg-red-100 text-red-700 border-red-200"

                return (
                  <div key={grade.id} className="flex flex-col md:flex-row gap-6 p-6 border border-muted/50 rounded-3xl bg-white hover:border-primary/20 hover:shadow-sm transition-all group">
                    
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold tracking-wide uppercase">
                          {grade.subjectName}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          Graded on {new Date(grade.gradedAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <Link to={`/student/assignments/${grade.assignmentId}`} className="inline-block">
                        <h3 className="font-bold text-lg text-[#0B1E43] leading-tight group-hover:text-primary transition-colors">
                          {grade.assignmentTitle}
                        </h3>
                      </Link>
                      
                      <p className="text-sm text-muted-foreground">
                        Evaluated by <span className="font-medium text-foreground">Prof. {grade.professorName}</span>
                      </p>

                      {grade.feedback && (
                        <div className="mt-3 p-4 bg-[#F4F7FE] rounded-2xl border border-slate-100">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Feedback</p>
                          <p className="text-sm text-[#0B1E43] italic leading-relaxed">"{grade.feedback}"</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-start md:items-end justify-center gap-4 border-t md:border-t-0 md:border-l border-muted/50 pt-4 md:pt-0 md:pl-6 min-w-[150px]">
                      <div className="flex flex-col items-start md:items-end">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Score</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-extrabold text-[#0B1E43]">{grade.marks}</span>
                          <span className="text-muted-foreground font-semibold">/ {grade.maxMarks}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`px-3 py-1 rounded-xl text-xs font-bold border ${badgeColor}`}>
                          Grade {grade.letterGrade}
                        </div>
                        {grade.credits > 0 && (
                          <div className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            +{grade.credits} Cr
                          </div>
                        )}
                      </div>
                      {grade.assignmentId && (
                        <Link to={`/student/assignments/${grade.assignmentId}`} className="text-primary text-sm font-bold flex items-center mt-1 group-hover:underline">
                          View Details <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      )}
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
