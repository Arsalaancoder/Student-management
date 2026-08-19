// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, TrendingDown, BookOpen, Clock, FileText, CheckCircle, AlertTriangle, Lightbulb } from "lucide-react"
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

export default function StudentAnalytics() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<any>({
    avgMarks: 0,
    totalCredits: 0,
    completionRate: 0,
    onTimeRate: 0,
    returnedRate: 0,
    similarityRate: 0
  })
  const [insight, setInsight] = useState<string | null>(null)
  const [chartData, setChartData] = useState<any>({
    marksOverTime: [],
    creditsOverTime: [],
    subjectPerformance: [],
    submissionStatus: []
  })

  const COLORS = ['#1E5EFF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

  useEffect(() => {
    if (!profile) return

    const fetchAnalytics = async () => {
      if (!profile) return
      try {
        setLoading(true)

        // 1. Fetch submissions for student
        const studentIds = [profile.id, profile.auth_user_id].filter(Boolean) as string[]
        const { data: submissions, error: subErr } = await supabase
          .from("submissions")
          .select("id, assignment_id, status, submitted_at, similarity_score")
          .in("student_id", studentIds)

        if (subErr) {
          console.error("Analytics submissions fetch error:", subErr)
        }

        const totalSubmissions = submissions?.length || 0
        const submissionMap = new Map<string, any>()
        const submittedAssignIds = new Set<string>()
        submissions?.forEach(s => {
          submissionMap.set(s.id, s)
          if (s.assignment_id) submittedAssignIds.add(s.assignment_id)
        })

        // 2. Fetch all assignments and filter by student profile OR student submissions
        const { data: rawAssignments, error: assignErr } = await supabase
          .from("assignments")
          .select("id, title, deadline, max_marks, max_credits, subject_id, subject_name, target_branch, target_year, all_sections, subjects(name), assignment_sections(section)")

        if (assignErr) {
          console.error("Analytics assignments fetch error:", assignErr)
        }

        const assignments = (rawAssignments || []).filter(a => 
          submittedAssignIds.has(a.id) || isAssignmentTargetedToStudent(a, profile)
        )
        const totalAssignmentsCount = assignments.length

        const onTimeCount = submissions?.filter(s => {
          const assign = assignments.find(a => a.id === s.assignment_id)
          if (!assign || !assign.deadline) return true
          return new Date(s.submitted_at).getTime() <= new Date(assign.deadline).getTime()
        }).length || 0

        const returnedCount = submissions?.filter(s => s.status === 'returned').length || 0

        const validSimilarities = submissions?.filter(s => s.similarity_score !== null && s.similarity_score !== undefined) || []
        const avgSimilarity = validSimilarities.length > 0 
          ? validSimilarities.reduce((acc, curr) => acc + Number(curr.similarity_score), 0) / validSimilarities.length 
          : 0

        // 3. Fetch grades for student's submissions
        const submissionIds = (submissions || []).map(s => s.id)
        let grades: any[] = []
        if (submissionIds.length > 0) {
          const { data: gradesData, error: gradeErr } = await supabase
            .from("grades")
            .select("id, submission_id, marks, credits, graded_at, is_draft")
            .in("submission_id", submissionIds)
            .order("graded_at", { ascending: true })

          if (gradeErr) {
            console.error("Analytics grades fetch error:", gradeErr)
          } else {
            grades = (gradesData || []).filter(g => !g.is_draft)
          }
        }

        const totalCredits = grades.reduce((acc, curr) => acc + (Number(curr.credits) || 0), 0)
        const validGrades = grades.filter(g => g.marks !== null && g.marks !== undefined)
        
        let totalMarksPercentage = 0
        const marksOverTimeData: any[] = []
        let cumulativeCredits = 0
        const creditsOverTimeData: any[] = []

        validGrades.forEach(g => {
          const sub = submissionMap.get(g.submission_id)
          const assignId = sub?.assignment_id
          const assign = assignments.find(a => a.id === assignId)
          
          const maxMarks = assign?.max_marks || 100
          const percentage = (Number(g.marks) / maxMarks) * 100
          totalMarksPercentage += percentage
          
          marksOverTimeData.push({
            name: assign?.title || "Assignment",
            date: g.graded_at ? new Date(g.graded_at).toLocaleDateString() : "Recent",
            score: Math.round(percentage)
          })

          const creditsVal = Number(g.credits) || 0
          if (creditsVal > 0) {
            cumulativeCredits += creditsVal
            creditsOverTimeData.push({
              name: assign?.title || "Assignment",
              date: g.graded_at ? new Date(g.graded_at).toLocaleDateString() : "Recent",
              credits: cumulativeCredits
            })
          }
        })

        const avgMarks = validGrades.length > 0 ? totalMarksPercentage / validGrades.length : 0

        // 4. Subject Performance
        const subjectMap: Record<string, { total: number, count: number }> = {}
        validGrades.forEach(g => {
          const sub = submissionMap.get(g.submission_id)
          const assignId = sub?.assignment_id
          const assign = assignments.find(a => a.id === assignId)
          
          const subName = assign?.subject_name || (assign?.subjects as any)?.name || "General"
          const maxMarks = assign?.max_marks || 100
          const percentage = (Number(g.marks) / maxMarks) * 100
          
          if (!subjectMap[subName]) subjectMap[subName] = { total: 0, count: 0 }
          subjectMap[subName].total += percentage
          subjectMap[subName].count += 1
        })

        const subjectPerformanceData = Object.keys(subjectMap).map(sub => ({
          name: sub.length > 15 ? sub.substring(0, 15) + "..." : sub,
          fullName: sub,
          average: Math.round(subjectMap[sub].total / subjectMap[sub].count)
        }))

        // 5. Submission Status Data
        const statusMap = {
          'Submitted': submissions?.filter(s => s.status === 'submitted' || s.status === 'under_review' || s.status === 'approved').length || 0,
          'Graded': grades.length || 0,
          'Returned': returnedCount,
          'Not Started': Math.max(0, totalAssignmentsCount - totalSubmissions)
        }

        const submissionStatusData = Object.entries(statusMap)
          .filter(([_, value]) => value > 0)
          .map(([name, value]) => ({ name, value }))

        // Insights logic
        if (marksOverTimeData.length >= 2) {
          const mid = Math.floor(marksOverTimeData.length / 2)
          const firstHalf = marksOverTimeData.slice(0, mid)
          const secondHalf = marksOverTimeData.slice(mid)
          
          const firstAvg = firstHalf.reduce((acc, curr) => acc + curr.score, 0) / firstHalf.length
          const secondAvg = secondHalf.reduce((acc, curr) => acc + curr.score, 0) / secondHalf.length
          
          const diff = secondAvg - firstAvg
          if (diff > 5) {
            setInsight(`Great job! Your average score increased by ${Math.round(diff)}% compared to your earlier assignments.`)
          } else if (diff < -5) {
            setInsight(`Your recent scores are slightly lower. Consider reviewing your recent feedback.`)
          } else {
            setInsight(`You are maintaining a consistent performance level. Keep up the good work!`)
          }
        } else if (marksOverTimeData.length === 1) {
          setInsight(`Your average score is ${marksOverTimeData[0].score}%. Keep submitting assignments to track your progress over time!`)
        } else {
          setInsight("Complete and get grades on more assignments to unlock personalized performance insights.")
        }

        setMetrics({
          avgMarks: Math.round(avgMarks),
          totalCredits,
          completionRate: totalAssignmentsCount > 0 ? Math.round((totalSubmissions / totalAssignmentsCount) * 100) : (totalSubmissions > 0 ? 100 : 0),
          onTimeRate: totalSubmissions > 0 ? Math.round((onTimeCount / totalSubmissions) * 100) : 0,
          returnedRate: totalSubmissions > 0 ? Math.round((returnedCount / totalSubmissions) * 100) : 0,
          similarityRate: Math.round(avgSimilarity)
        })

        setChartData({
          marksOverTime: marksOverTimeData,
          creditsOverTime: creditsOverTimeData,
          subjectPerformance: subjectPerformanceData,
          submissionStatus: submissionStatusData
        })

      } catch (err) {
        console.error("Error fetching analytics:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [profile])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Analytics & Progress</h1>
        <p className="text-muted-foreground mt-1">Track your academic performance over time.</p>
      </div>

      {insight && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
          <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600 shrink-0">
            <Lightbulb className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-indigo-900 text-lg">Performance Insight</h3>
            <p className="text-indigo-800/80 mt-1">{insight}</p>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Avg Marks</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.avgMarks ?? 0}%</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-yellow-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Credits</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.totalCredits ?? 0}</h3>
              </div>
              <div className="p-3 bg-yellow-50 rounded-xl text-yellow-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-green-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Completion</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.completionRate ?? 0}%</h3>
              </div>
              <div className="p-3 bg-green-50 rounded-xl text-green-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-teal-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">On-Time</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.onTimeRate ?? 0}%</h3>
              </div>
              <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-orange-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Returned</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.returnedRate ?? 0}%</h3>
              </div>
              <div className="p-3 bg-orange-50 rounded-xl text-orange-600">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden relative group">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Similarity</p>
                <h3 className="text-3xl font-extrabold text-[#0B1E43]">{metrics?.similarityRate ?? 0}%</h3>
              </div>
              <div className="p-3 bg-red-50 rounded-xl text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Marks Over Time */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Marks Over Time</CardTitle>
            <CardDescription>Your percentage score across all graded assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.marksOverTime.length > 0 ? (
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.marksOverTime} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(value) => value.substring(0, 10) + '...'} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '4px' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#1E5EFF" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Score (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full mt-4 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400">Not enough graded assignments</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credits Earned */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Cumulative Credits</CardTitle>
            <CardDescription>Total credits earned over time</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.creditsOverTime.length > 0 ? (
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.creditsOverTime} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(value) => value.substring(0, 10) + '...'} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="credits" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#colorCredits)" name="Total Credits" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full mt-4 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400">No credits earned yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subject Performance */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Subject Performance</CardTitle>
            <CardDescription>Average percentage score by subject</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.subjectPerformance.length > 0 ? (
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.subjectPerformance} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} domain={[0, 100]} />
                    <Tooltip 
                      cursor={{ fill: '#F1F5F9' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(_, payload) => payload[0]?.payload?.fullName || "Subject"}
                    />
                    <Bar dataKey="average" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Average Score (%)" barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full mt-4 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400">Not enough graded assignments</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submission Status */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Assignment Status</CardTitle>
            <CardDescription>Breakdown of all your assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.submissionStatus.length > 0 ? (
              <div className="h-[300px] w-full mt-4 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.submissionStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.submissionStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full mt-4 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400">No assignments assigned</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
