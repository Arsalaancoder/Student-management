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

interface SectionOverviewCard {
  section: string
  totalStudents: number
  submittedCount: number
  pendingCount: number
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
  const [dashboardError, setDashboardError] = useState<string | null>(null)

  const fetchDashboardData = async () => {
    if (!profile) return
    try {
      setLoading(true)
      setDashboardError(null)
      
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

      // 3. Get all assignments created by this logged-in professor
      const { data: myAssignments, error: myAssignErr } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", profile.id)

      if (myAssignErr) throw myAssignErr

      const assignmentIds = myAssignments?.map(a => a.id) || []

      let subsCount = 0
      let pendingCount = 0
      let formattedActivity: RecentActivity[] = []

      if (assignmentIds.length > 0) {
        // 4. Fetch Real Submissions from Supabase joined with profiles & assignments
        const { data: submissions, error: subsErr } = await supabase
          .from("submissions")
          .select(`
            id,
            status,
            submitted_at,
            assignment_id,
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
            assignments (title)
          `)
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false })

        if (subsErr) throw subsErr

        subsCount = submissions?.length || 0
        pendingCount = submissions?.filter(s => s.status === "submitted").length || 0

        formattedActivity = (submissions || []).slice(0, 5).map((s: any) => {
          const p = s.profiles || {}
          const name = p.full_name || p.email || (p.student_id ? `Student (${p.student_id})` : "Student Profile")
          return {
            id: s.id,
            studentName: name,
            studentId: p.student_id || "N/A",
            department: p.department || "Not provided",
            year: p.year ? `${p.year}${p.year === 1 ? 'st' : p.year === 2 ? 'nd' : p.year === 3 ? 'rd' : 'th'} Year` : "Not provided",
            section: p.section ? `Section ${p.section}` : "Not provided",
            profilePhoto: p.profile_photo_url || null,
            assignmentTitle: s.assignments?.title || "Assignment",
            submittedAt: s.submitted_at,
            status: s.status || "submitted"
          }
        })
      }

      setStats({
        totalSubjects: subjectsCount || 0,
        activeAssignments: activeAssigCount || 0,
        totalSubmissions: subsCount,
        pendingReviews: pendingCount,
        totalStudents: 0
      })
      setRecentActivity(formattedActivity)

    } catch (error: any) {
      console.error("Supabase Error fetching professor dashboard submissions:", error)
      setDashboardError("Unable to load submissions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()

    // Realtime subscription for submissions
    const channel = supabase
      .channel("professor-recent-submissions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        () => {
          fetchDashboardData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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
      <div className="bg-[#1E5EFF] rounded-[2.5rem] p-6 sm:p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between mt-2 text-white shadow-md gap-6">
        <div className="relative z-10 max-w-lg mb-4 md:mb-0 w-full">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Hello, <span className="capitalize">{profile?.full_name || "Professor"}</span>
          </h1>
          <p className="text-white/80 text-sm sm:text-base md:text-lg font-medium leading-relaxed">
            You have {stats.pendingReviews} submissions waiting for your review. Keep up the great work in shaping future minds!
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
            <Button asChild className="bg-white text-[#1E5EFF] hover:bg-white/90 rounded-full px-6 font-bold shadow-sm h-11">
              <Link to="/professor/assignments/create">Create Assignment</Link>
            </Button>
            <Button asChild variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white rounded-full px-6 font-bold backdrop-blur-sm h-11">
              <Link to="/professor/submissions">Review Submissions</Link>
            </Button>
          </div>
        </div>

        {/* Professor Classroom Illustration */}
        <div className="relative z-10 w-full max-w-[260px] sm:max-w-xs md:max-w-sm h-auto flex items-center justify-center flex-shrink-0">
          <img 
            src="/professor-illustration.png" 
            alt="Professor classroom illustration" 
            className="w-full h-auto max-h-56 md:max-h-64 object-contain drop-shadow-md rounded-2xl"
          />
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-20 w-64 h-64 bg-[#0A2540]/20 rounded-full blur-2xl translate-y-1/3 pointer-events-none" />
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Subjects</CardTitle>
            <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalSubjects}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Students</CardTitle>
            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 flex-shrink-0">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalStudents}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Submissions</CardTitle>
            <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 flex-shrink-0">
              <ClipboardList className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.totalSubmissions}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pending Reviews</CardTitle>
            <div className="h-10 w-10 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 flex-shrink-0">
              <Clock className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-bold text-[#0B1E43] tracking-tight">{stats.pendingReviews}</div>
          </CardContent>
        </Card>
      </div>



      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Recent Submissions */}
        <Card className="col-span-1 lg:col-span-2 border-none shadow-sm rounded-[2rem]">
          <CardHeader className="p-6 sm:p-8 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl">Recent Submissions</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Latest student work ready for grading.</CardDescription>
            </div>
            <Button variant="link" asChild className="text-primary font-bold">
              <Link to="/professor/submissions">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8">
            <div className="space-y-4">
              {dashboardError ? (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-200 text-center gap-3">
                  <p className="text-sm font-bold text-slate-700">{dashboardError}</p>
                  <Button onClick={() => fetchDashboardData()} className="rounded-xl px-6 bg-[#1E5EFF] font-bold text-xs h-9">
                    Try Again
                  </Button>
                </div>
              ) : recentActivity.length === 0 ? (
                <EmptyState 
                  icon={ClipboardList} 
                  title="No submissions yet" 
                  description="Student submissions will appear here once students submit assignments." 
                />
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 border border-muted/50 rounded-2xl bg-white hover:border-primary/20 hover:shadow-sm transition-all gap-4">
                    <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0 overflow-hidden border border-slate-100">
                        {item.profilePhoto ? (
                          <img src={item.profilePhoto} alt={item.studentName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-base">{item.studentName.charAt(0)}</span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#0B1E43] text-base truncate">{item.studentName}</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-bold rounded-md uppercase tracking-wider">ID: {item.studentId}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap font-medium">
                          <span>{item.department}</span>
                          <span>&bull;</span>
                          <span>{item.year}</span>
                          <span>&bull;</span>
                          <span>{item.section}</span>
                        </div>
                        <span className="text-sm font-semibold text-primary truncate pt-0.5">{item.assignmentTitle}</span>
                      </div>
                    </div>
                    
                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0">
                      <span className="text-xs font-bold text-muted-foreground">{getRelativeTime(item.submittedAt)}</span>
                      <div className="flex items-center gap-2">
                        {item.status === "submitted" ? (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-wider">Needs Review</span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wider">Graded</span>
                        )}
                        <Button asChild size="sm" className="rounded-xl font-bold text-xs bg-[#1E5EFF] hover:bg-blue-700">
                          <Link to={`/professor/submissions/${item.id}/review`}>Review</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-slate-50">
          <CardHeader className="p-6 sm:p-8 pb-4">
            <CardTitle className="text-lg sm:text-xl">Quick Actions</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Common tasks to manage your classes.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col gap-3">
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/assignments/create"><FileText className="mr-3 h-5 w-5 text-blue-500 flex-shrink-0" /> <span className="truncate">Create Assignment</span></Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/classes"><Users className="mr-3 h-5 w-5 text-purple-500 flex-shrink-0" /> <span className="truncate">View Class List</span></Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-14 rounded-2xl bg-white border-muted/50 hover:border-primary/50 hover:bg-white font-bold text-[#0B1E43]">
              <Link to="/professor/submissions"><CheckCircle className="mr-3 h-5 w-5 text-green-500 flex-shrink-0" /> <span className="truncate">Grade Submissions</span></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
