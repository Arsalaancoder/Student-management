// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Loader2, Users, FileText, CheckCircle, Clock, AlertTriangle, 
  TrendingUp, AlertCircle, Filter, RefreshCw, Award, ShieldAlert, XCircle 
} from "lucide-react"

interface AssignmentItem {
  id: string
  title: string
  deadline: string
  max_marks: number
  max_credits: number
  target_branch: string | null
  target_year: number | null
  all_sections: boolean | null
}

interface StudentPerformanceItem {
  id: string
  name: string
  studentId: string
  department: string
  year: number | null
  section: string | null
  submittedCount: number
  hasSubmitted: boolean
  isLate: boolean
  avgMarks: number | null
  avgCredits: number | null
  maxSimilarity: number | null
}

interface SectionPerformanceItem {
  section: string
  totalStudents: number
  submittedCount: number
  notSubmittedCount: number
  avgMarks: number
  highestMarks: number
  lowestMarks: number
  avgCredits: number
  plagiarismAlerts: number
}

interface AssignmentPerformanceItem {
  id: string
  title: string
  deadline: string
  totalSubmissions: number
  lateSubmissions: number
  avgMarks: number
  highestMarks: number
  lowestMarks: number
  avgCredits: number
  plagiarismAlerts: number
}

export default function ProfessorAnalytics() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  
  // Filter States
  const [selectedBranch, setSelectedBranch] = useState("all")
  const [selectedYear, setSelectedYear] = useState("all")
  const [selectedSection, setSelectedSection] = useState("all")
  const [selectedAssignment, setSelectedAssignment] = useState("all")

  // Data States
  const [myAssignments, setMyAssignments] = useState<AssignmentItem[]>([])
  const [globalMetrics, setGlobalMetrics] = useState({
    totalStudents: 0,
    submittedCount: 0,
    notSubmittedCount: 0,
    lateCount: 0,
    averageMarks: 0,
    highestMarks: 0,
    lowestMarks: 0,
    averageCredits: 0,
    plagiarismAlerts: 0
  })

  const [assignmentPerformance, setAssignmentPerformance] = useState<AssignmentPerformanceItem[]>([])
  const [sectionPerformance, setSectionPerformance] = useState<SectionPerformanceItem[]>([])
  const [studentPerformance, setStudentPerformance] = useState<StudentPerformanceItem[]>([])

  const fetchAnalyticsData = async () => {
    if (!profile) return
    try {
      setLoading(true)

      // 1. Fetch all assignments created by this professor
      const { data: assignmentsData, error: assignErr } = await supabase
        .from("assignments")
        .select("id, title, deadline, max_marks, max_credits, target_branch, target_year, all_sections, created_at")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false })

      if (assignErr) throw assignErr
      const assignments = assignmentsData || []
      setMyAssignments(assignments)

      // 2. Fetch student profiles filtered by selected Branch, Year, and Section
      let studentQuery = supabase
        .from("profiles")
        .select("id, full_name, email, student_id, department, year, section, profile_photo_url")
        .eq("role", "student")

      if (selectedBranch !== "all") {
        studentQuery = studentQuery.eq("department", selectedBranch)
      }
      if (selectedYear !== "all") {
        studentQuery = studentQuery.eq("year", parseInt(selectedYear))
      }
      if (selectedSection !== "all") {
        studentQuery = studentQuery.eq("section", selectedSection)
      }

      const { data: targetedStudents, error: studentErr } = await studentQuery
      if (studentErr) throw studentErr

      const studentsList = targetedStudents || []
      const studentIds = studentsList.map(s => s.id)

      // Filter assignment targets
      let filteredAssignments = assignments
      if (selectedAssignment !== "all") {
        filteredAssignments = assignments.filter(a => a.id === selectedAssignment)
      }
      const targetAssignIds = filteredAssignments.map(a => a.id)

      // 3. Fetch submissions & grades for targeted students and assignments
      let submissionsList: any[] = []
      let gradesList: any[] = []

      if (studentIds.length > 0 && targetAssignIds.length > 0) {
        const { data: subsData } = await supabase
          .from("submissions")
          .select("id, assignment_id, student_id, status, submitted_at, similarity_score")
          .in("assignment_id", targetAssignIds)
          .in("student_id", studentIds)

        submissionsList = subsData || []

        if (submissionsList.length > 0) {
          const subIds = submissionsList.map(s => s.id)
          const { data: grsData } = await supabase
            .from("grades")
            .select("id, submission_id, marks, credits, is_draft")
            .in("submission_id", subIds)
            .eq("is_draft", false)

          gradesList = grsData || []
        }
      }

      // Quick Maps for fast calculations
      const assignmentMap = new Map<string, AssignmentItem>()
      assignments.forEach(a => assignmentMap.set(a.id, a))

      const gradeBySubIdMap = new Map<string, any>()
      gradesList.forEach(g => gradeBySubIdMap.set(g.submission_id, g))

      const studentSubsMap = new Map<string, any[]>()
      submissionsList.forEach(s => {
        const list = studentSubsMap.get(s.student_id) || []
        list.push(s)
        studentSubsMap.set(s.student_id, list)
      })

      // 4. Calculate Global Metrics
      const totalStudents = studentsList.length
      const submittedStudentIds = new Set(submissionsList.map(s => s.student_id))
      const submittedCount = submittedStudentIds.size
      const notSubmittedCount = Math.max(0, totalStudents - submittedCount)

      let lateCount = 0
      let plagiarismAlerts = 0

      submissionsList.forEach(s => {
        const assign = assignmentMap.get(s.assignment_id)
        if (assign && assign.deadline && new Date(s.submitted_at).getTime() > new Date(assign.deadline).getTime()) {
          lateCount++
        }
        if (s.similarity_score && s.similarity_score > 30) {
          plagiarismAlerts++
        }
      })

      const allMarks = gradesList.map(g => Number(g.marks)).filter(m => !isNaN(m))
      const allCredits = gradesList.map(g => Number(g.credits)).filter(c => !isNaN(c))

      const averageMarks = allMarks.length > 0 ? allMarks.reduce((a, b) => a + b, 0) / allMarks.length : 0
      const highestMarks = allMarks.length > 0 ? Math.max(...allMarks) : 0
      const lowestMarks = allMarks.length > 0 ? Math.min(...allMarks) : 0
      const averageCredits = allCredits.length > 0 ? allCredits.reduce((a, b) => a + b, 0) / allCredits.length : 0

      setGlobalMetrics({
        totalStudents,
        submittedCount,
        notSubmittedCount,
        lateCount,
        averageMarks: Math.round(averageMarks * 10) / 10,
        highestMarks,
        lowestMarks,
        averageCredits: Math.round(averageCredits * 10) / 10,
        plagiarismAlerts
      })

      // 5. Assignment Performance Table
      const assignPerf: AssignmentPerformanceItem[] = filteredAssignments.map(assign => {
        const subs = submissionsList.filter(s => s.assignment_id === assign.id)
        const subIds = new Set(subs.map(s => s.id))
        const assignGrades = gradesList.filter(g => subIds.has(g.submission_id))

        const assignMarks = assignGrades.map(g => Number(g.marks)).filter(m => !isNaN(m))
        const assignCredits = assignGrades.map(g => Number(g.credits)).filter(c => !isNaN(c))

        let assignLate = 0
        let assignPlag = 0
        subs.forEach(s => {
          if (assign.deadline && new Date(s.submitted_at).getTime() > new Date(assign.deadline).getTime()) {
            assignLate++
          }
          if (s.similarity_score && s.similarity_score > 30) {
            assignPlag++
          }
        })

        return {
          id: assign.id,
          title: assign.title,
          deadline: assign.deadline,
          totalSubmissions: subs.length,
          lateSubmissions: assignLate,
          avgMarks: assignMarks.length > 0 ? Math.round((assignMarks.reduce((a, b) => a + b, 0) / assignMarks.length) * 10) / 10 : 0,
          highestMarks: assignMarks.length > 0 ? Math.max(...assignMarks) : 0,
          lowestMarks: assignMarks.length > 0 ? Math.min(...assignMarks) : 0,
          avgCredits: assignCredits.length > 0 ? Math.round((assignCredits.reduce((a, b) => a + b, 0) / assignCredits.length) * 10) / 10 : 0,
          plagiarismAlerts: assignPlag
        }
      })
      setAssignmentPerformance(assignPerf)

      // 6. Section Performance Table (Sections A - F)
      const sections = ["A", "B", "C", "D", "E", "F"]
      const secPerf: SectionPerformanceItem[] = sections.map(sec => {
        const secStudents = studentsList.filter(s => s.section && s.section.trim().toUpperCase() === sec)
        const secStudentIdSet = new Set(secStudents.map(s => s.id))
        const secSubs = submissionsList.filter(s => secStudentIdSet.has(s.student_id))
        const secSubIdSet = new Set(secSubs.map(s => s.id))
        const secGrades = gradesList.filter(g => secSubIdSet.has(g.submission_id))

        const submittedCountSec = new Set(secSubs.map(s => s.student_id)).size
        const notSubmittedSec = Math.max(0, secStudents.length - submittedCountSec)

        const secMarks = secGrades.map(g => Number(g.marks)).filter(m => !isNaN(m))
        const secCredits = secGrades.map(g => Number(g.credits)).filter(c => !isNaN(c))

        let secPlag = 0
        secSubs.forEach(s => {
          if (s.similarity_score && s.similarity_score > 30) secPlag++
        })

        return {
          section: sec,
          totalStudents: secStudents.length,
          submittedCount: submittedCountSec,
          notSubmittedCount: notSubmittedSec,
          avgMarks: secMarks.length > 0 ? Math.round((secMarks.reduce((a, b) => a + b, 0) / secMarks.length) * 10) / 10 : 0,
          highestMarks: secMarks.length > 0 ? Math.max(...secMarks) : 0,
          lowestMarks: secMarks.length > 0 ? Math.min(...secMarks) : 0,
          avgCredits: secCredits.length > 0 ? Math.round((secCredits.reduce((a, b) => a + b, 0) / secCredits.length) * 10) / 10 : 0,
          plagiarismAlerts: secPlag
        }
      })
      setSectionPerformance(secPerf)

      // 7. Student Performance Table
      const studPerf: StudentPerformanceItem[] = studentsList.map(st => {
        const stSubs = studentSubsMap.get(st.id) || []
        const stName = st.full_name || st.email || (st.student_id ? `Student (${st.student_id})` : "Student Profile")
        
        let isLate = false
        let maxSim: number | null = null
        const stMarks: number[] = []
        const stCredits: number[] = []

        stSubs.forEach(s => {
          const assign = assignmentMap.get(s.assignment_id)
          if (assign && assign.deadline && new Date(s.submitted_at).getTime() > new Date(assign.deadline).getTime()) {
            isLate = true
          }
          if (s.similarity_score !== null && s.similarity_score !== undefined) {
            if (maxSim === null || s.similarity_score > maxSim) maxSim = s.similarity_score
          }
          const grade = gradeBySubIdMap.get(s.id)
          if (grade && grade.marks !== null) stMarks.push(Number(grade.marks))
          if (grade && grade.credits !== null) stCredits.push(Number(grade.credits))
        })

        return {
          id: st.id,
          name: stName,
          studentId: st.student_id || "N/A",
          department: st.department || "Not provided",
          year: st.year,
          section: st.section,
          submittedCount: stSubs.length,
          hasSubmitted: stSubs.length > 0,
          isLate,
          avgMarks: stMarks.length > 0 ? Math.round((stMarks.reduce((a, b) => a + b, 0) / stMarks.length) * 10) / 10 : null,
          avgCredits: stCredits.length > 0 ? Math.round((stCredits.reduce((a, b) => a + b, 0) / stCredits.length) * 10) / 10 : null,
          maxSimilarity: maxSim
        }
      })
      setStudentPerformance(studPerf)

    } catch (err) {
      console.error("Error fetching academic analytics:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalyticsData()
  }, [profile, selectedBranch, selectedYear, selectedSection, selectedAssignment])

  const resetFilters = () => {
    setSelectedBranch("all")
    setSelectedYear("all")
    setSelectedSection("all")
    setSelectedAssignment("all")
  }

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
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Academic Analytics</h1>
        <p className="text-muted-foreground mt-1">Real-time performance analytics calculated directly from Supabase database.</p>
      </div>

      {/* Filter Controls Bar */}
      <Card className="border-none shadow-sm rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#1E5EFF]" />
            <h3 className="font-bold text-[#0B1E43] text-sm uppercase tracking-wider">Filter Target Audience & Assignment</h3>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={resetFilters} 
            className="text-xs text-slate-500 hover:text-slate-900 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset Filters
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Branch Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Branches</option>
              <option value="Computer Science & Engineering">CSE</option>
              <option value="Information Technology">IT</option>
              <option value="Electronics & Communication">ECE</option>
              <option value="Electrical & Electronics">EEE</option>
              <option value="Mechanical Engineering">MECH</option>
              <option value="Civil Engineering">CIVIL</option>
              <option value="AI & ML">AI & ML</option>
              <option value="Data Science">Data Science (AI&DS)</option>
              <option value="Ai&Ds">Ai&Ds</option>
            </select>
          </div>

          {/* Year Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          {/* Section Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
              <option value="E">Section E</option>
              <option value="F">Section F</option>
            </select>
          </div>

          {/* Assignment Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Assignment</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="w-full h-10 px-3 bg-[#F4F7FE] border-none rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
            >
              <option value="all">All Assignments</option>
              {myAssignments.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Global Computed Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-9">
        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Students</p>
            <h3 className="text-2xl font-extrabold text-[#0B1E43]">{globalMetrics.totalStudents}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Submitted</p>
            <h3 className="text-2xl font-extrabold text-emerald-700">{globalMetrics.submittedCount}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Not Submitted</p>
            <h3 className="text-2xl font-extrabold text-slate-700">{globalMetrics.notSubmittedCount}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-orange-600 uppercase tracking-wider mb-1">Late</p>
            <h3 className="text-2xl font-extrabold text-orange-700">{globalMetrics.lateCount}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">Avg Marks</p>
            <h3 className="text-2xl font-extrabold text-[#1E5EFF]">{globalMetrics.averageMarks}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-green-600 uppercase tracking-wider mb-1">Highest Marks</p>
            <h3 className="text-2xl font-extrabold text-green-700">{globalMetrics.highestMarks}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-1">Lowest Marks</p>
            <h3 className="text-2xl font-extrabold text-red-700">{globalMetrics.lowestMarks}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider mb-1">Avg Credits</p>
            <h3 className="text-2xl font-extrabold text-purple-700">{globalMetrics.averageCredits}</h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white col-span-1">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider mb-1">Plag Alerts</p>
            <h3 className="text-2xl font-extrabold text-rose-700">{globalMetrics.plagiarismAlerts}</h3>
          </CardContent>
        </Card>
      </div>



      {/* 2. Section Performance Table */}
      <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 p-6">
          <CardTitle className="text-lg font-bold text-[#0B1E43]">Section Performance</CardTitle>
          <CardDescription>Comparative section metrics across target Branch & Year.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Section</th>
                <th className="px-6 py-4 text-center">Total Students</th>
                <th className="px-6 py-4 text-center">Submitted</th>
                <th className="px-6 py-4 text-center">Not Submitted</th>
                <th className="px-6 py-4 text-center">Avg Marks</th>
                <th className="px-6 py-4 text-center">Highest</th>
                <th className="px-6 py-4 text-center">Lowest</th>
                <th className="px-6 py-4 text-center">Avg Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionPerformance.map(sec => (
                <tr key={sec.section} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-[#0B1E43]">Section {sec.section}</td>
                  <td className="px-6 py-4 text-center font-bold text-slate-800">{sec.totalStudents}</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">{sec.submittedCount}</td>
                  <td className="px-6 py-4 text-center text-slate-500">{sec.notSubmittedCount}</td>
                  <td className="px-6 py-4 text-center font-bold text-[#1E5EFF]">{sec.avgMarks}</td>
                  <td className="px-6 py-4 text-center text-emerald-600 font-bold">{sec.highestMarks}</td>
                  <td className="px-6 py-4 text-center text-rose-600 font-bold">{sec.lowestMarks}</td>
                  <td className="px-6 py-4 text-center font-bold text-purple-700">{sec.avgCredits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. Student Performance Table */}
      <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 p-6">
          <CardTitle className="text-lg font-bold text-[#0B1E43]">Student Performance</CardTitle>
          <CardDescription>Individual student submission and grading metrics.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Student Name</th>
                <th className="px-6 py-4">Roll Number</th>
                <th className="px-6 py-4 text-center">Academic Group</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Late</th>
                <th className="px-6 py-4 text-center">Avg Marks</th>
                <th className="px-6 py-4 text-center">Avg Credits</th>
                <th className="px-6 py-4 text-center">Max Similarity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentPerformance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">No students found matching selected filters.</td>
                </tr>
              ) : (
                studentPerformance.map(st => (
                  <tr key={st.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-[#0B1E43]">{st.name}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-700">{st.studentId}</td>
                    <td className="px-6 py-4 text-center text-xs font-medium text-slate-600">
                      {st.department} &bull; Year {st.year || 'N/A'} &bull; Sec {st.section || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {st.hasSubmitted ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg uppercase tracking-wider">Submitted</span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg uppercase tracking-wider">Not Submitted</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {st.isLate ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 font-bold text-xs rounded-md">Late</span>
                      ) : (
                        <span className="text-slate-400 text-xs">On Time</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-[#1E5EFF]">
                      {st.avgMarks !== null ? st.avgMarks : '-'}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-purple-700">
                      {st.avgCredits !== null ? st.avgCredits : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {st.maxSimilarity !== null ? (
                        <span className={`font-bold ${st.maxSimilarity > 30 ? 'text-red-600' : 'text-slate-700'}`}>
                          {st.maxSimilarity}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  )
}

