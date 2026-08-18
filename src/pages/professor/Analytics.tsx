// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Users, FileText, CheckCircle, Clock, AlertTriangle, TrendingUp, AlertCircle } from "lucide-react"

export default function ProfessorAnalytics() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<any>(null)
  const [assignmentAnalytics, setAssignmentAnalytics] = useState<any[]>([])
  const [attentionStudents, setAttentionStudents] = useState<any[]>([])

  useEffect(() => {
    if (!profile) return

    const fetchAnalytics = async () => {
      try {
        setLoading(true)

        // 1. Fetch Subjects
        const { data: subjects } = await supabase
          .from("subjects")
          .select("id, name")
          .eq("professor_id", profile.id)

        const subjectIds = (subjects || []).map(s => s.id)

        // 2. Fetch Enrollments
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("student_id, profiles!inner(full_name)")
          .in("subject_id", subjectIds)

        const totalStudents = new Set((enrollments || []).map(e => e.student_id)).size

        // 3. Fetch Assignments
        const { data: assignments } = await supabase
          .from("assignments")
          .select("id, title, deadline, max_marks")
          .in("subject_id", subjectIds)

        const assignmentIds = (assignments || []).map(a => a.id)

        // 4. Fetch Submissions
        const { data: submissions } = await supabase
          .from("submissions")
          .select("id, assignment_id, student_id, status, submitted_at, similarity_score, profiles!inner(full_name)")
          .in("assignment_id", assignmentIds)

        const totalSubmissions = submissions?.length || 0
        const pendingReviews = submissions?.filter(s => s.status === 'submitted').length || 0

        let lateSubmissions = 0
        let similarityAlerts = 0

        submissions?.forEach(s => {
          const assign = assignments?.find(a => a.id === s.assignment_id)
          if (assign && new Date(s.submitted_at).getTime() > new Date(assign.deadline).getTime()) {
            lateSubmissions++
          }
          if (s.similarity_score && s.similarity_score > 30) {
            similarityAlerts++
          }
        })

        // 5. Fetch Grades
        const { data: grades } = await supabase
          .from("grades")
          .select("marks, submission_id, submissions(assignment_id)")
          .in("submission_id", (submissions || []).map(s => s.id))
          .eq("is_draft", false)

        let totalMarksPercentage = 0
        const validGrades = grades?.filter(g => g.marks !== null) || []

        validGrades.forEach(g => {
          const assignId = g.submissions?.assignment_id
          const assign = assignments?.find(a => a.id === assignId)
          if (assign && assign.max_marks > 0) {
            totalMarksPercentage += (g.marks / assign.max_marks) * 100
          }
        })

        const avgScore = validGrades.length > 0 ? totalMarksPercentage / validGrades.length : 0

        // 6. Assignment Analytics Table
        const assignmentStats = (assignments || []).map(assign => {
          const subs = submissions?.filter(s => s.assignment_id === assign.id) || []
          const subGrades = grades?.filter(g => subs.find(s => s.id === g.submission_id)) || []
          
          let highest = 0
          let lowest = 100
          let totalMarks = 0
          
          subGrades.forEach(g => {
            if (assign.max_marks > 0) {
              const perc = (g.marks / assign.max_marks) * 100
              totalMarks += perc
              if (perc > highest) highest = perc
              if (perc < lowest) lowest = perc
            }
          })

          if (subGrades.length === 0) lowest = 0

          const validSims = subs.filter(s => s.similarity_score !== null)
          const avgSim = validSims.length > 0 
            ? validSims.reduce((acc, curr) => acc + curr.similarity_score, 0) / validSims.length 
            : 0

          const onTimeCount = subs.filter(s => new Date(s.submitted_at).getTime() <= new Date(assign.deadline).getTime()).length

          return {
            id: assign.id,
            title: assign.title,
            submissionCount: subs.length,
            avgScore: subGrades.length > 0 ? totalMarks / subGrades.length : 0,
            highestScore: highest,
            lowestScore: lowest,
            avgSimilarity: avgSim,
            onTimePercentage: subs.length > 0 ? (onTimeCount / subs.length) * 100 : 0
          }
        })

        // 7. Students Needing Attention Logic
        const studentMap: Record<string, { name: string, lateCount: number, pendingCount: number, highSimCount: number }> = {}
        
        submissions?.forEach(s => {
          if (!studentMap[s.student_id]) {
            studentMap[s.student_id] = { name: s.profiles?.full_name || "Unknown", lateCount: 0, pendingCount: 0, highSimCount: 0 }
          }
          
          const assign = assignments?.find(a => a.id === s.assignment_id)
          if (assign && new Date(s.submitted_at).getTime() > new Date(assign.deadline).getTime()) {
            studentMap[s.student_id].lateCount++
          }
          
          if (s.similarity_score && s.similarity_score > 30) {
            studentMap[s.student_id].highSimCount++
          }
        })

        // Calculate missing assignments
        const alerts: any[] = []
        
        // Let's iterate over each enrolled student
        const uniqueStudents = new Map()
        enrollments?.forEach(e => {
          if (!uniqueStudents.has(e.student_id)) {
            uniqueStudents.set(e.student_id, e.profiles?.full_name || "Unknown")
          }
        })

        uniqueStudents.forEach((name, studentId) => {
          const sMap = studentMap[studentId] || { lateCount: 0, pendingCount: 0, highSimCount: 0 }
          const studentSubs = submissions?.filter(s => s.student_id === studentId) || []
          
          // Check for multiple pending (missing) assignments. 
          // An assignment is missing if the deadline passed and no submission exists.
          let missingCount = 0
          assignments?.forEach(assign => {
            const hasSub = studentSubs.find(s => s.assignment_id === assign.id)
            if (!hasSub && new Date().getTime() > new Date(assign.deadline).getTime()) {
              missingCount++
            }
          })

          const reasons = []
          if (missingCount >= 2) reasons.push(`${missingCount} missing assignments`)
          if (sMap.lateCount >= 2) reasons.push(`${sMap.lateCount} late submissions`)
          if (sMap.highSimCount >= 2) reasons.push(`${sMap.highSimCount} high similarity alerts`)
          
          if (reasons.length > 0) {
            alerts.push({
              studentId,
              name,
              reason: reasons.join(", ")
            })
          }
        })

        setAttentionStudents(alerts)
        setAssignmentAnalytics(assignmentStats)
        
        const totalExpectedSubmissions = totalStudents * (assignments?.length || 0)

        setMetrics({
          totalStudents,
          totalSubmissions,
          pendingReviews,
          avgScore: Math.round(avgScore),
          submissionRate: totalExpectedSubmissions > 0 ? Math.round((totalSubmissions / totalExpectedSubmissions) * 100) : 0,
          lateRate: totalSubmissions > 0 ? Math.round((lateSubmissions / totalSubmissions) * 100) : 0,
          similarityAlerts
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
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Professor Analytics</h1>
        <p className="text-muted-foreground mt-1">Class performance and submission metrics.</p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Students</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.totalStudents}</h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Submissions</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.totalSubmissions}</h3>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <FileText className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Pending</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.pendingReviews}</h3>
              </div>
              <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Avg Score</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.avgScore}%</h3>
              </div>
              <div className="p-2 bg-green-50 rounded-lg text-green-600">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Sub Rate</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.submissionRate}%</h3>
              </div>
              <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                <CheckCircle className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Late Rate</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.lateRate}%</h3>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Sim Alerts</p>
                <h3 className="text-2xl font-extrabold text-[#0B1E43]">{metrics.similarityAlerts}</h3>
              </div>
              <div className="p-2 bg-red-50 rounded-lg text-red-600">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Assignment Analytics Table */}
        <Card className="lg:col-span-2 border-none shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-lg">Assignment Analytics</CardTitle>
            <CardDescription>Detailed metrics for each assignment</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Assignment</th>
                  <th className="px-6 py-4 text-center">Submissions</th>
                  <th className="px-6 py-4 text-center">Avg Score</th>
                  <th className="px-6 py-4 text-center">Highest</th>
                  <th className="px-6 py-4 text-center">Lowest</th>
                  <th className="px-6 py-4 text-center">Avg Sim</th>
                  <th className="px-6 py-4 text-center">On-Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignmentAnalytics.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No assignment data available</td>
                  </tr>
                ) : (
                  assignmentAnalytics.map(assign => (
                    <tr key={assign.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 truncate max-w-[200px]" title={assign.title}>{assign.title}</td>
                      <td className="px-6 py-4 text-center">{assign.submissionCount}</td>
                      <td className="px-6 py-4 text-center font-bold text-blue-600">{Math.round(assign.avgScore)}%</td>
                      <td className="px-6 py-4 text-center text-green-600">{Math.round(assign.highestScore)}%</td>
                      <td className="px-6 py-4 text-center text-red-600">{Math.round(assign.lowestScore)}%</td>
                      <td className="px-6 py-4 text-center">{Math.round(assign.avgSimilarity)}%</td>
                      <td className="px-6 py-4 text-center">{Math.round(assign.onTimePercentage)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Students Needing Attention */}
        <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden flex flex-col">
          <CardHeader className="bg-red-50/50 border-b border-red-100">
            <CardTitle className="text-lg text-red-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Students Needing Attention
            </CardTitle>
            <CardDescription className="text-red-700/70">Based on missing, late, or flagged work</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[500px]">
            {attentionStudents.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
                <p className="font-bold text-slate-900">All Good!</p>
                <p className="text-sm text-slate-500 mt-1">No students are currently flagged for attention.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {attentionStudents.map((student, idx) => (
                  <div key={idx} className="p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{student.name}</p>
                        <p className="text-sm text-red-600 font-medium mt-0.5 leading-snug">{student.reason}</p>
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
