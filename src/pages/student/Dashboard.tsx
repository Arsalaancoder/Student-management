// @ts-nocheck
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookOpen, Clock, CheckCircle2, TrendingUp, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Link } from "react-router-dom"
import { useSmartReminders } from "@/hooks/useSmartReminders"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ClipboardList, Award } from "lucide-react"

interface DashboardStats {
  creditsEarned: number
  enrolledSubjects: number
  pendingAssignments: number
  completedAssignments: number
  averageScore: number
  completionRate: number
  onTimeRate: number
}

interface RecentAssignment {
  id: string
  title: string
  subjectName: string
  deadline: string
}

interface RecentGrade {
  id: string
  title: string
  marks: number
  maxMarks: number
  grade: string
}

export default function StudentDashboard() {
  const { profile } = useAuth()
  useSmartReminders()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    creditsEarned: 0,
    enrolledSubjects: 0,
    pendingAssignments: 0,
    completedAssignments: 0,
    averageScore: 0,
    completionRate: 0,
    onTimeRate: 0
  })
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([])
  const [recentGrades, setRecentGrades] = useState<RecentGrade[]>([])

  useEffect(() => {
    if (!profile) return

    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        
        // 1. Fetch Credits Earned
        const { data: creditsData } = await supabase
          .from("credit_transactions")
          .select("credits")
          .eq("student_id" as any, profile.id)
        
        const totalCredits = creditsData?.reduce((acc, curr) => acc + Number(curr.credits), 0) || 0

        // 2. Fetch Enrolled Subjects Count
        const { count: enrolledCount } = await supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("student_id" as any, profile.id)

        // 3. Fetch Completed Assignments Count
        const { count: completedCount } = await supabase
          .from("submissions")
          .select("*", { count: "exact", head: true })
          .eq("student_id" as any, profile.id)

        // 4. Fetch Enrollments with Subject Details to get Pending Assignments
        const { data: enrollments } = (await supabase
          .from("enrollments")
          .select("subject_id")
          .eq("student_id" as any, profile.id)) as any

        const subjectIds = enrollments?.map((e: any) => e.subject_id) || []
        
        let pendingCount = 0
        let recentAssigns: RecentAssignment[] = []

        if (subjectIds.length > 0) {
          // Get all assignments for enrolled subjects
          const { data: allAssignments } = (await supabase
            .from("assignments")
            .select("id, title, deadline, subjects(name)")
            .in("subject_id" as any, subjectIds)) as any

          // Get student's submissions to filter out completed ones
          const { data: mySubmissions } = (await supabase
            .from("submissions")
            .select("assignment_id")
            .eq("student_id" as any, profile.id)) as any

          const submittedAssignmentIds = new Set(mySubmissions?.map((s: any) => s.assignment_id) || [])

          const pendingAssignmentsList = (allAssignments || [])
            .filter((a: any) => !submittedAssignmentIds.has(a.id))
            .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

          pendingCount = pendingAssignmentsList.length
          
          recentAssigns = pendingAssignmentsList.slice(0, 3).map((a: any) => ({
            id: a.id,
            title: a.title,
            subjectName: (a.subjects as any)?.name || "Unknown Subject",
            deadline: a.deadline
          }))
        }

        // 5. Fetch Recent Grades
        const { data: gradesData } = await supabase
          .from("grades")
          .select(`
            id, 
            marks, 
            graded_at,
            submissions (
              assignments (
                title,
                max_marks
              )
            )
          `)
          .order('graded_at', { ascending: false })
          .limit(3)
        
        // Filter grades to only those belonging to this student's submissions
        // The policy handles this somewhat, but doing a manual filter if needed, 
        // actually RLS ensures we only see our own grades.
        const formattedGrades = (gradesData || []).map((g: any) => {
          const maxMarks = g.submissions?.assignments?.max_marks || 100
          const marks = Number(g.marks) || 0
          const percentage = (marks / maxMarks) * 100
          
          let letterGrade = "F"
          if (percentage >= 90) letterGrade = "A"
          else if (percentage >= 80) letterGrade = "B"
          else if (percentage >= 70) letterGrade = "C"
          else if (percentage >= 60) letterGrade = "D"

          return {
            id: g.id,
            title: g.submissions?.assignments?.title || "Unknown Assignment",
            marks,
            maxMarks,
            grade: letterGrade
          }
        })

        // Calculate analytics
        // Completion Rate
        const totalAssigned = pendingCount + (completedCount || 0)
        const completionRate = totalAssigned > 0 ? Math.round(((completedCount || 0) / totalAssigned) * 100) : 0

        // Average Score
        let averageScore = 0
        if (formattedGrades.length > 0) {
          const sumPercentages = formattedGrades.reduce((sum: number, g: any) => sum + ((g.marks / g.maxMarks) * 100), 0)
          averageScore = Math.round(sumPercentages / formattedGrades.length)
        }

        // On-Time Rate
        let onTimeRate = 0
        const { data: myAllSubmissions } = (await supabase
          .from("submissions")
          .select("submitted_at, assignments(deadline)")
          .eq("student_id" as any, profile.id)) as any

        if (myAllSubmissions && myAllSubmissions.length > 0) {
          const onTimeCount = myAllSubmissions.filter((s: any) => {
            const submittedAt = new Date(s.submitted_at).getTime()
            const deadline = new Date(s.assignments?.deadline).getTime()
            return submittedAt <= deadline
          }).length
          onTimeRate = Math.round((onTimeCount / myAllSubmissions.length) * 100)
        }

        setStats({
          creditsEarned: totalCredits,
          enrolledSubjects: enrolledCount || 0,
          pendingAssignments: pendingCount,
          completedAssignments: completedCount || 0,
          averageScore,
          completionRate,
          onTimeRate
        })
        setRecentAssignments(recentAssigns)
        setRecentGrades(formattedGrades)
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [profile])

  const getDaysUntil = (dateString: string) => {
    const days = Math.ceil((new Date(dateString).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    if (days < 0) return "Overdue"
    if (days === 0) return "Today"
    if (days === 1) return "Tomorrow"
    return `In ${days} days`
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <Skeleton className="h-[250px] w-full rounded-[2.5rem]" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-[140px] rounded-3xl" />
          <Skeleton className="h-[140px] rounded-3xl" />
          <Skeleton className="h-[140px] rounded-3xl" />
          <Skeleton className="h-[140px] rounded-3xl" />
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <Skeleton className="h-[300px] rounded-[2rem]" />
          <Skeleton className="h-[300px] rounded-[2rem]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* Welcome Banner */}
      <div className="bg-[#E6F0FF] rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between mt-2">
        <div className="relative z-10 max-w-lg mb-8 md:mb-0">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-[#0B1E43]">
            Welcome back <span className="bg-[#8BB1FF] text-white px-3 py-1 rounded-xl inline-block mt-1 capitalize">{profile?.full_name?.split(' ')[0] || "Student"}</span>
          </h1>
          <p className="text-muted-foreground md:text-lg">
            Ready to track your academic progress? You have {stats.pendingAssignments} assignments due and your overall performance is looking great.
          </p>
        </div>
        
        {/* SVG Illustration */}
        <div className="relative z-10 w-64 h-48 md:w-80 md:h-64 flex items-center justify-center flex-shrink-0">
          <img 
            src="/webinar-pana.svg" 
            alt="Academic illustration" 
            className="w-full h-full object-contain drop-shadow-md"
          />
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-20 w-64 h-64 bg-[#B5CDFF]/30 rounded-full blur-2xl translate-y-1/3" />
      </div>

      {/* Metric Cards - Frisbee Style */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500" />
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Average Score</CardTitle>
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.averageScore.toFixed(1)}%</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm font-medium text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-md">Excellent</span>
              <span className="text-xs text-muted-foreground">overall performance</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500" />
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Credits Earned</CardTitle>
            <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors duration-300">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.creditsEarned}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">across {stats.enrolledSubjects} enrolled subjects</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500" />
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pending</CardTitle>
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors duration-300">
              <Clock className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.pendingAssignments}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">assignments to complete</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500" />
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Completed</CardTitle>
            <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.completedAssignments}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">{stats.onTimeRate.toFixed(0)}% on-time submission rate</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Upcoming Deadlines */}
        <Card className="rounded-[2rem] border-none shadow-sm flex flex-col h-full">
          <CardHeader className="pb-2 pt-8 px-8">
            <CardTitle className="text-xl">Upcoming Deadlines</CardTitle>
            <CardDescription>Your pending assignments sorted by due date.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 px-8 pb-8 pt-4">
            {recentAssignments.length === 0 ? (
              <EmptyState 
                icon={ClipboardList} 
                title="All caught up!" 
                description="You don't have any pending assignments due soon." 
              />
            ) : (
              <div className="space-y-4">
                {recentAssignments.map((assignment) => (
                  <div key={assignment.id} className="group p-4 bg-white border rounded-2xl flex items-center justify-between hover:shadow-md hover:border-primary/20 transition-all duration-300">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{assignment.title}</p>
                      <p className="text-xs text-muted-foreground font-medium">{assignment.subjectName}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg">
                        {getDaysUntil(assignment.deadline)}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(assignment.deadline).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Grades */}
        <Card className="rounded-[2rem] border-none shadow-sm flex flex-col h-full">
          <CardHeader className="pb-2 pt-8 px-8">
            <CardTitle className="text-xl">Recent Grades</CardTitle>
            <CardDescription>Your latest evaluated assignments.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 px-8 pb-8 pt-4">
            {recentGrades.length === 0 ? (
              <EmptyState 
                icon={Award} 
                title="No grades yet" 
                description="Your evaluated submissions will appear here." 
              />
            ) : (
              <div className="space-y-4">
                {recentGrades.map((grade) => (
                  <div key={grade.id} className="group p-4 bg-white border rounded-2xl flex items-center justify-between hover:shadow-md transition-all duration-300">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{grade.title}</p>
                      <p className="text-xs text-muted-foreground font-medium">Evaluated just now</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-[#0B1E43]">{grade.marks}</span>
                        <span className="text-xs text-muted-foreground">/{grade.maxMarks}</span>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        grade.grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                        grade.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                        grade.grade === 'C' ? 'bg-orange-100 text-orange-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        Grade {grade.grade}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
