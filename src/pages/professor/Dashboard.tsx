// @ts-nocheck
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookOpen, Users, ClipboardList, CheckCircle, Clock, Loader2, FileText } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface DashboardStats {
  totalSubjects: number
  activeAssignments: number
  totalSubmissions: number
  pendingReviews: number
  totalStudents: number
}

interface RecentActivity {
  id: string
  studentName: string
  assignmentTitle: string
  submittedAt: string
  status: string
}

export default function ProfessorDashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalSubjects: 0,
    activeAssignments: 0,
    totalSubmissions: 0,
    pendingReviews: 0,
    totalStudents: 0
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])

  useEffect(() => {
    if (!profile) return

    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        
        // 1. Fetch Subjects Count
        const { count: subjectsCount } = await supabase
          .from("subjects")
          .select("*", { count: "exact", head: true })
          .eq("professor_id", profile.id)

        // 2. Fetch Active Assignments Count
        const { count: activeAssigCount } = await supabase
          .from("assignments")
          .select("*", { count: "exact", head: true })
          .eq("created_by", profile.id)
          .gt("deadline", new Date().toISOString())

        // 3. Get all my assignments to fetch submissions
        const { data: myAssignments } = await supabase
          .from("assignments")
          .select("id")
          .eq("created_by", profile.id)

        const assignmentIds = myAssignments?.map(a => a.id) || []

        let subsCount = 0
        let pendingCount = 0
        let formattedActivity: RecentActivity[] = []

        if (assignmentIds.length > 0) {
          // 4. Fetch Submissions
          const { data: submissions } = await supabase
            .from("submissions")
            .select(`
              id,
              status,
              submitted_at,
              assignment_id,
              profiles:student_id (full_name),
              assignments (title)
            `)
            .in("assignment_id", assignmentIds)
            .order("submitted_at", { ascending: false })

          subsCount = submissions?.length || 0
          pendingCount = submissions?.filter(s => s.status === "submitted").length || 0

          formattedActivity = (submissions || []).slice(0, 5).map((s: any) => ({
            id: s.id,
            studentName: s.profiles?.full_name || "Unknown Student",
            assignmentTitle: s.assignments?.title || "Unknown Assignment",
            submittedAt: s.submitted_at,
            status: s.status || "submitted"
          }))
        }

        setStats({
          totalSubjects: subjectsCount || 0,
          activeAssignments: activeAssigCount || 0,
          totalSubmissions: subsCount,
          pendingReviews: pendingCount,
          totalStudents: 0 // Logic for student count would go here
        })
        setRecentActivity(formattedActivity)

      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [profile])

  const getRelativeTime = (dateString: string) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const daysDifference = Math.round((new Date(dateString).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference === 0) {
        const hoursDifference = Math.round((new Date(dateString).getTime() - new Date().getTime()) / (1000 * 60 * 60));
        if (hoursDifference === 0) {
            const minutesDifference = Math.round((new Date(dateString).getTime() - new Date().getTime()) / (1000 * 60));
            return rtf.format(minutesDifference, 'minute');
        }
        return rtf.format(hoursDifference, 'hour');
    }
    return rtf.format(daysDifference, 'day');
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
        <div className="grid gap-8 md:grid-cols-3">
          <Skeleton className="col-span-1 lg:col-span-2 h-[400px] rounded-[2rem]" />
          <Skeleton className="col-span-1 h-[400px] rounded-[2rem]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* Welcome Banner */}
      <div className="bg-[#1E5EFF] rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between mt-2 text-white shadow-md">
        <div className="relative z-10 max-w-lg mb-8 md:mb-0">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Hello, <span className="capitalize">{profile?.full_name || "Professor"}</span>
          </h1>
          <p className="text-white/80 md:text-lg font-medium leading-relaxed">
            You have {stats.pendingReviews} submissions waiting for your review. Keep up the great work in shaping future minds!
          </p>
          <div className="mt-8 flex gap-4">
            <Button asChild className="bg-white text-[#1E5EFF] hover:bg-white/90 rounded-full px-6 font-bold shadow-sm">
              <Link to="/professor/assignments">Create Assignment</Link>
            </Button>
            <Button asChild variant="outline" className="text-white border-white/20 hover:bg-white/10 rounded-full px-6 font-bold backdrop-blur-sm">
              <Link to="/professor/submissions">Review Submissions</Link>
            </Button>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-20 w-64 h-64 bg-[#0A2540]/20 rounded-full blur-2xl translate-y-1/3" />
      </div>

      {/* Metric Cards - Minimal Variant */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Subjects</CardTitle>
            <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalSubjects}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Students</CardTitle>
            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalStudents}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Submissions</CardTitle>
            <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
              <ClipboardList className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalSubmissions}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pending Reviews</CardTitle>
            <div className="h-10 w-10 bg-rose-50 rounded-full flex items-center justify-center text-rose-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.pendingReviews}</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Submissions */}
        <Card className="col-span-1 lg:col-span-2 border-none shadow-sm rounded-[2rem]">
          <CardHeader className="p-8 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Recent Submissions</CardTitle>
              <CardDescription>Latest student work ready for grading.</CardDescription>
            </div>
            <Button variant="link" asChild className="text-primary font-bold">
              <Link to="/professor/submissions">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <EmptyState 
                  icon={ClipboardList} 
                  title="No submissions to review" 
                  description="Student submissions will appear here once submitted." 
                />
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-5 border border-muted/50 rounded-2xl bg-white hover:border-primary/20 hover:shadow-sm transition-all">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {item.studentName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-[#0B1E43]">{item.studentName}</span>
                        <span className="text-sm font-medium text-muted-foreground">{item.assignmentTitle}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs font-bold text-muted-foreground">{getRelativeTime(item.submittedAt)}</span>
                      {item.status === "submitted" ? (
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-wider">Needs Review</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wider">Graded</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-slate-50">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl">Quick Actions</CardTitle>
            <CardDescription>Common tasks to manage your classes.</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 flex flex-col gap-3">
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/assignments"><FileText className="mr-3 h-5 w-5 text-blue-500" /> Create Assignment</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/classes"><Users className="mr-3 h-5 w-5 text-purple-500" /> View Class List</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/submissions"><CheckCircle className="mr-3 h-5 w-5 text-green-500" /> Grade Submissions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
