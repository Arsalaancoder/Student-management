// @ts-nocheck
import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Award, 
  Download, 
  Filter, 
  Search, 
  RefreshCw, 
  BookOpen, 
  FileSpreadsheet, 
  Building,
  Layers,
  ChevronRight,
  ChevronLeft,
  AlertCircle
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { normalizeBranch, isAssignmentTargetedToStudent } from "@/lib/targeting"
import { useDebounce } from "@/hooks/useDebounce"

const STANDARD_BRANCHES = [
  { id: "cse", label: "CSE", full: "Computer Science & Engineering" },
  { id: "aids", label: "AI & DS", full: "Artificial Intelligence & Data Science" },
  { id: "aiml", label: "AI & ML", full: "Artificial Intelligence & Machine Learning" },
  { id: "ece", label: "ECE", full: "Electronics & Communication" },
  { id: "eee", label: "EEE", full: "Electrical & Electronics" },
  { id: "mech", label: "MECH", full: "Mechanical Engineering" },
  { id: "civil", label: "CIVIL", full: "Civil Engineering" },
  { id: "it", label: "IT", full: "Information Technology" },
]

export default function StudentProgress() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Database Raw State
  const [students, setStudents] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [gradesMap, setGradesMap] = useState<Map<string, any>>(new Map())
  const [creditsMap, setCreditsMap] = useState<Map<string, number>>(new Map())

  // Filter States
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [selectedSection, setSelectedSection] = useState<string>("all")
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 25

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedBranch, selectedSection, selectedAssignmentId, selectedStatus, debouncedSearchQuery])

  // Fetch all real-time data from Supabase efficiently
  const fetchData = async (isManualRefresh = false) => {
    if (!profile) return
    try {
      if (isManualRefresh) setRefreshing(true)
      else setLoading(true)

      // 1. Fetch All Student Profiles
      const { data: studentProfiles, error: studentErr } = await supabase
        .from("profiles")
        .select("id, auth_user_id, student_id, full_name, email, department, year, section")
        .eq("role", "student")
        .order("full_name")

      if (studentErr) throw studentErr

      // 2. Fetch Assignments created by professor (or all active assignments)
      const { data: assignmentsData, error: assignErr } = await supabase
        .from("assignments")
        .select("id, title, subject_name, target_branch, target_year, all_sections, max_marks, max_credits, created_at, created_by, assignment_sections(section)")
        .order("created_at", { ascending: false })

      if (assignErr) throw assignErr

      const profAssignments = (assignmentsData || []).filter(a => !a.created_by || a.created_by === profile.id)
      const finalAssignments = profAssignments.length > 0 ? profAssignments : (assignmentsData || [])

      // 3. Fetch All Submissions
      const { data: submissionsData, error: subErr } = await supabase
        .from("submissions")
        .select("id, assignment_id, student_id, status, submitted_at")

      if (subErr) throw subErr

      // 4. Fetch All Grades
      const { data: gradesData } = await supabase
        .from("grades")
        .select("id, submission_id, marks, graded_at")

      const gMap = new Map<string, any>()
      gradesData?.forEach(g => {
        gMap.set(g.submission_id, g)
      })

      // 5. Fetch Credit Transactions
      const { data: creditsData } = await supabase
        .from("credit_transactions")
        .select("student_id, credits")

      const cMap = new Map<string, number>()
      creditsData?.forEach(c => {
        const curr = cMap.get(c.student_id) || 0
        cMap.set(c.student_id, curr + Number(c.credits))
      })

      setStudents(studentProfiles || [])
      setAssignments(finalAssignments)
      setSubmissions(submissionsData || [])
      setGradesMap(gMap)
      setCreditsMap(cMap)

    } catch (err: any) {
      console.error("Error fetching Student Progress data:", err)
      toast.error("Unable to load student data. Please try again.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Realtime subscriptions with unique channel names
    const channelId = `student-progress-realtime-${profile?.id || 'prof'}`
    const subChannel = supabase
      .channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => fetchData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "grades" }, () => fetchData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => fetchData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_transactions" }, () => fetchData(true))
      .subscribe()

    return () => {
      supabase.removeChannel(subChannel)
    }
  }, [profile])

  // Extract Available Sections based on selected branch
  const availableSections = useMemo(() => {
    const sectionsSet = new Set<string>()
    students.forEach(s => {
      if (s.section && s.section.trim()) {
        if (selectedBranch === "all" || normalizeBranch(s.department) === normalizeBranch(selectedBranch)) {
          sectionsSet.add(s.section.trim().toUpperCase())
        }
      }
    })
    return Array.from(sectionsSet).sort()
  }, [students, selectedBranch])

  // Process Student Progress Records
  const studentRecords = useMemo(() => {
    const records: any[] = []

    const subByStudentAssign = new Map<string, any>()
    submissions.forEach(sub => {
      subByStudentAssign.set(`${sub.student_id}_${sub.assignment_id}`, sub)
    })

    const activeAssignments = selectedAssignmentId !== "all" 
      ? assignments.filter(a => a.id === selectedAssignmentId)
      : (assignments.length > 0 ? assignments : [{ id: "none", title: "General Progress", max_marks: 100 }])

    students.forEach(student => {
      const studentBranchNorm = normalizeBranch(student.department)

      if (selectedBranch !== "all" && studentBranchNorm !== normalizeBranch(selectedBranch)) {
        return
      }

      if (selectedSection !== "all" && student.section?.trim().toUpperCase() !== selectedSection.toUpperCase()) {
        return
      }

      activeAssignments.forEach(assign => {
        // Skip assignment if not targeted to this student's profile
        if (assign.id !== "none" && !isAssignmentTargetedToStudent(assign, student)) {
          return
        }

        const subKey = `${student.id}_${assign.id}`
        const submission = subByStudentAssign.get(subKey)
        const grade = submission ? gradesMap.get(submission.id) : null

        const isCompleted = Boolean(submission && ['submitted', 'under_review', 'approved', 'graded'].includes(submission.status))
        const creditsEarned = creditsMap.get(student.id) || 0

        const regNo = student.student_id || student.id.slice(0, 8).toUpperCase()
        const branchDisplay = student.department || "General"
        const sectionDisplay = student.section ? `Section ${student.section.trim().toUpperCase()}` : "A"

        let statusText = isCompleted ? "Completed" : "Not Completed"
        if (submission?.status === "graded") statusText = "Graded"

        const record = {
          id: `${student.id}_${assign.id}`,
          studentId: student.id,
          regNo,
          name: student.full_name || student.email?.split("@")[0] || "Student",
          email: student.email,
          branch: branchDisplay,
          branchNorm: studentBranchNorm,
          section: sectionDisplay,
          rawSection: student.section?.trim().toUpperCase() || "A",
          assignmentId: assign.id,
          assignmentTitle: assign.title || "N/A",
          isCompleted,
          status: statusText,
          submittedAt: submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "-",
          marks: grade?.marks !== undefined ? `${grade.marks}/${assign.max_marks || 100}` : "-",
          rawMarks: grade?.marks !== undefined ? Number(grade.marks) : null,
          maxMarks: assign.max_marks || 100,
          credits: creditsEarned
        }

        if (selectedStatus === "completed" && !isCompleted) return
        if (selectedStatus === "not_completed" && isCompleted) return
        if (selectedStatus === "credits_earned" && creditsEarned <= 0) return

        if (debouncedSearchQuery.trim()) {
          const q = debouncedSearchQuery.toLowerCase().trim()
          const matchName = record.name.toLowerCase().includes(q)
          const matchReg = record.regNo.toLowerCase().includes(q)
          const matchEmail = record.email.toLowerCase().includes(q)
          if (!matchName && !matchReg && !matchEmail) return
        }

        records.push(record)
      })
    })

    return records
  }, [students, assignments, submissions, gradesMap, creditsMap, selectedBranch, selectedSection, selectedAssignmentId, selectedStatus, debouncedSearchQuery])

  // Paginated Records for display
  const totalPages = Math.ceil(studentRecords.length / pageSize) || 1
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return studentRecords.slice(start, start + pageSize)
  }, [studentRecords, currentPage, pageSize])

  // Calculate Overall Statistics
  const overallStats = useMemo(() => {
    const totalStudentsCount = students.length
    let totalCompleted = 0
    let totalPending = 0

    const filteredStudentIds = new Set<string>()
    studentRecords.forEach(r => {
      filteredStudentIds.add(r.studentId)
      if (r.isCompleted) totalCompleted++
      else totalPending++
    })

    let studentsWithCreditsCount = 0
    students.forEach(s => {
      const c = creditsMap.get(s.id) || 0
      if (c > 0) studentsWithCreditsCount++
    })

    return {
      totalRegistered: totalStudentsCount,
      displayedStudents: filteredStudentIds.size,
      totalCompleted,
      totalPending,
      studentsWithCredits: studentsWithCreditsCount
    }
  }, [students, studentRecords, creditsMap])

  // Branch-Wise Statistics Calculation
  const branchStatsList = useMemo(() => {
    return STANDARD_BRANCHES.map(branch => {
      const branchNorm = branch.id
      const branchStudents = students.filter(s => normalizeBranch(s.department) === branchNorm)

      let completedCount = 0
      let totalPossible = 0
      let totalCredits = 0

      const subByStudentAssign = new Map<string, any>()
      submissions.forEach(sub => {
        subByStudentAssign.set(`${sub.student_id}_${sub.assignment_id}`, sub)
      })

      branchStudents.forEach(s => {
        totalCredits += creditsMap.get(s.id) || 0

        assignments.forEach(assign => {
          if (isAssignmentTargetedToStudent(assign, s)) {
            totalPossible++
            const sub = subByStudentAssign.get(`${s.id}_${assign.id}`)
            if (sub && ['submitted', 'under_review', 'approved', 'graded'].includes(sub.status)) {
              completedCount++
            }
          }
        })
      })

      const notCompletedCount = Math.max(0, totalPossible - completedCount)

      return {
        id: branch.id,
        label: branch.label,
        full: branch.full,
        registered: branchStudents.length,
        completed: completedCount,
        notCompleted: notCompletedCount,
        credits: totalCredits
      }
    })
  }, [students, assignments, submissions, creditsMap])

  // Section-Wise Statistics Calculation
  const sectionStatsList = useMemo(() => {
    const sections = ["A", "B", "C", "D"]
    return sections.map(sec => {
      const sectionStudents = students.filter(s => {
        const matchSec = s.section?.trim().toUpperCase() === sec
        const matchBranch = selectedBranch === "all" || normalizeBranch(s.department) === normalizeBranch(selectedBranch)
        return matchSec && matchBranch
      })

      let completed = 0
      let totalPossible = 0
      let totalCredits = 0

      const subByStudentAssign = new Map<string, any>()
      submissions.forEach(sub => {
        subByStudentAssign.set(`${sub.student_id}_${sub.assignment_id}`, sub)
      })

      sectionStudents.forEach(s => {
        totalCredits += creditsMap.get(s.id) || 0

        assignments.forEach(assign => {
          if (isAssignmentTargetedToStudent(assign, s)) {
            totalPossible++
            const sub = subByStudentAssign.get(`${s.id}_${assign.id}`)
            if (sub && ['submitted', 'under_review', 'approved', 'graded'].includes(sub.status)) {
              completed++
            }
          }
        })
      })

      const notCompleted = Math.max(0, totalPossible - completed)

      return {
        section: sec,
        registered: sectionStudents.length,
        completed,
        notCompleted,
        credits: totalCredits
      }
    })
  }, [students, assignments, submissions, creditsMap, selectedBranch])

  // Excel Export Handler using XLSX library
  const handleExportExcel = (exportType: "current" | "branch" | "section" | "complete" = "current") => {
    try {
      let exportData: any[] = []
      let fileName = "EduTrack_Student_Progress_Report.xlsx"

      if (exportType === "current") {
        exportData = studentRecords.map((r, idx) => ({
          "S.No": idx + 1,
          "Register Number": r.regNo,
          "Student Name": r.name,
          "Email": r.email,
          "Branch": r.branch,
          "Section": r.section,
          "Assignment": r.assignmentTitle,
          "Submission Status": r.status,
          "Submitted At": r.submittedAt,
          "Marks": r.marks,
          "Credits Earned": r.credits
        }))
        const branchLabel = selectedBranch !== "all" ? selectedBranch.toUpperCase() : "All_Branches"
        const sectionLabel = selectedSection !== "all" ? `Sec_${selectedSection}` : "All_Sections"
        fileName = `EduTrack_${branchLabel}_${sectionLabel}_Report.xlsx`
      } else if (exportType === "branch") {
        const filteredRecords = studentRecords.filter(r => selectedBranch === "all" || r.branchNorm === normalizeBranch(selectedBranch))
        exportData = filteredRecords.map((r, idx) => ({
          "S.No": idx + 1,
          "Register Number": r.regNo,
          "Student Name": r.name,
          "Email": r.email,
          "Branch": r.branch,
          "Section": r.section,
          "Assignment": r.assignmentTitle,
          "Status": r.status,
          "Submitted Date": r.submittedAt,
          "Marks": r.marks,
          "Credits": r.credits
        }))
        fileName = `EduTrack_Branch_${selectedBranch.toUpperCase()}_Report.xlsx`
      } else if (exportType === "section") {
        exportData = studentRecords.map((r, idx) => ({
          "S.No": idx + 1,
          "Register Number": r.regNo,
          "Student Name": r.name,
          "Email": r.email,
          "Branch": r.branch,
          "Section": r.section,
          "Assignment": r.assignmentTitle,
          "Status": r.status,
          "Submitted Date": r.submittedAt,
          "Marks": r.marks,
          "Credits": r.credits
        }))
        fileName = `EduTrack_Section_${selectedSection}_Report.xlsx`
      } else {
        exportData = students.map((s, idx) => {
          const c = creditsMap.get(s.id) || 0
          return {
            "S.No": idx + 1,
            "Register Number": s.student_id || s.id.slice(0, 8).toUpperCase(),
            "Student Name": s.full_name || "Student",
            "Email": s.email,
            "Branch": s.department || "General",
            "Year": s.year ? `Year ${s.year}` : "-",
            "Section": s.section ? `Section ${s.section}` : "-",
            "Credits Earned": c
          }
        })
        fileName = "EduTrack_Complete_Academic_Report.xlsx"
      }

      if (exportData.length === 0) {
        toast.warning("No student records available to export for the selected filters.")
        return
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Student Progress")

      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.max(key.length + 5, 18)
      }))
      worksheet["!cols"] = colWidths

      XLSX.writeFile(workbook, fileName)
      toast.success(`Exported ${exportData.length} record(s) to ${fileName}`)
    } catch (err: any) {
      console.error("Excel export error:", err)
      toast.error("Failed to generate Excel report. Please try again.")
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-4 w-96 rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 rounded-[2rem]" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xs border border-slate-100 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-extrabold rounded-lg tracking-wider uppercase">
              Real-time Academic Management
            </span>
            {refreshing && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin text-primary" /> Updating live data...
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0B1E43] dark:text-white">
            Student Progress & Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track assignment completion, student performance, and credit distribution branch-wise & section-wise.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="rounded-2xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold gap-2 text-xs sm:text-sm h-11"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-2xl bg-[#1E5EFF] hover:bg-[#1E5EFF]/90 font-bold gap-2 text-xs sm:text-sm h-11 shadow-md hover:shadow-lg transition-all">
                <FileSpreadsheet className="h-4 w-4" />
                Download Excel
                <ChevronRight className="h-4 w-4 rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-xl p-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800">
              <DropdownMenuLabel className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-3 py-2">
                Export Options
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExportExcel("current")} className="rounded-xl cursor-pointer font-bold text-slate-700 dark:text-slate-200 py-2.5">
                <Download className="mr-2 h-4 w-4 text-primary" />
                Current Filtered View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportExcel("branch")} className="rounded-xl cursor-pointer font-bold text-slate-700 dark:text-slate-200 py-2.5">
                <Building className="mr-2 h-4 w-4 text-purple-500" />
                Branch Report ({selectedBranch.toUpperCase()})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportExcel("section")} className="rounded-xl cursor-pointer font-bold text-slate-700 dark:text-slate-200 py-2.5">
                <Layers className="mr-2 h-4 w-4 text-orange-500" />
                Section Report ({selectedSection})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExportExcel("complete")} className="rounded-xl cursor-pointer font-bold text-slate-700 dark:text-slate-200 py-2.5">
                <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                Complete Master Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Top 4 Statistic Cards */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 rounded-2xl">
                <Users className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered</span>
            </div>
            <div className="text-3xl font-black text-[#0B1E43] dark:text-white tracking-tight">{overallStats.totalRegistered}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Total active student accounts</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-2xl">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed</span>
            </div>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{overallStats.totalCompleted}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Assignments submitted & verified</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300 rounded-2xl">
                <Clock className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Not Completed</span>
            </div>
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{overallStats.totalPending}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Pending student submissions</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300 rounded-2xl">
                <Award className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Credits Earned</span>
            </div>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{overallStats.studentsWithCredits}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Students rewarded academic credits</p>
          </CardContent>
        </Card>
      </div>

      {/* Branch-Wise Overview Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#0B1E43] dark:text-white flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" /> Branch-wise Overview
          </h2>
          <span className="text-xs font-semibold text-slate-400">Click branch to filter table</span>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {branchStatsList.map(branch => {
            const isSelected = selectedBranch.toLowerCase() === branch.id
            return (
              <Card 
                key={branch.id} 
                onClick={() => setSelectedBranch(isSelected ? "all" : branch.id)}
                className={`border-2 cursor-pointer transition-all duration-300 rounded-[2rem] overflow-hidden ${
                  isSelected 
                    ? "border-[#1E5EFF] bg-blue-50/30 dark:bg-blue-900/20 shadow-md scale-[1.01]" 
                    : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-200 hover:shadow-xs"
                }`}
              >
                <CardContent className="p-6 space-y-4">
                  {/* Badge & Big Count Header */}
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 text-xs font-black rounded-xl ${isSelected ? "bg-[#1E5EFF] text-white" : "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                      {branch.label}
                    </span>
                    <span className="text-2xl font-black text-[#0B1E43] dark:text-white">
                      {branch.registered}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[#0B1E43] dark:text-white truncate" title={branch.full}>
                      {branch.full}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Registered Students</p>
                  </div>

                  {/* Clean Spacious Metrics List */}
                  <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Completed:</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">{branch.completed}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Not Completed:</span>
                      <span className="font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-md">{branch.notCompleted}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Credits Earned:</span>
                      <span className="font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-md">{branch.credits}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Section-Wise Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#0B1E43] dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-600" /> Section-wise Information {selectedBranch !== "all" ? `(${selectedBranch.toUpperCase()})` : ""}
          </h2>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {sectionStatsList.map(sec => {
            const isSelected = selectedSection.toUpperCase() === sec.section
            return (
              <Card 
                key={sec.section}
                onClick={() => setSelectedSection(isSelected ? "all" : sec.section)}
                className={`border-2 cursor-pointer transition-all duration-300 rounded-[2rem] overflow-hidden ${
                  isSelected 
                    ? "border-purple-600 bg-purple-50/30 dark:bg-purple-900/20 shadow-md scale-[1.01]" 
                    : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-200 hover:shadow-xs"
                }`}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 text-xs font-black rounded-xl ${isSelected ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"}`}>
                      Section {sec.section}
                    </span>
                    <span className="text-2xl font-black text-[#0B1E43] dark:text-white">
                      {sec.registered}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[#0B1E43] dark:text-white">
                      Section {sec.section} Cohort
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Registered Students</p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Completed:</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">{sec.completed}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Not Completed:</span>
                      <span className="font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-md">{sec.notCompleted}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Credits Earned:</span>
                      <span className="font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-md">{sec.credits}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Filter Controls Bar */}
      <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-[#0B1E43] dark:text-white">Filter Student Records:</span>
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase hidden sm:inline">Branch:</span>
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-primary/20 cursor-pointer"
              >
                <option value="all">All Branches</option>
                {STANDARD_BRANCHES.map(b => (
                  <option key={b.id} value={b.id}>{b.label} - {b.full}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase hidden sm:inline">Section:</span>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-primary/20 cursor-pointer"
              >
                <option value="all">All Sections</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
                <option value="D">Section D</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase hidden sm:inline">Assignment:</span>
              <select
                value={selectedAssignmentId}
                onChange={e => setSelectedAssignmentId(e.target.value)}
                className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-primary/20 max-w-[180px] sm:max-w-[220px] truncate cursor-pointer"
              >
                <option value="all">All Assignments</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-primary/20 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="not_completed">Not Completed</option>
                <option value="credits_earned">Credits Earned</option>
              </select>
            </div>

            {(selectedBranch !== "all" || selectedSection !== "all" || selectedAssignmentId !== "all" || selectedStatus !== "all" || searchQuery) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedBranch("all")
                  setSelectedSection("all")
                  setSelectedAssignmentId("all")
                  setSelectedStatus("all")
                  setSearchQuery("")
                }}
                className="h-11 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-2xl"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Student Data Table */}
      <Card className="border-none shadow-xs rounded-[2rem] bg-white dark:bg-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#0B1E43] dark:text-white">Student Performance Records</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing {studentRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, studentRecords.length)} of {studentRecords.length} record(s)
            </p>
          </div>
          <span className="text-xs font-extrabold text-primary bg-primary/10 px-3 py-1.5 rounded-full self-start sm:self-auto">
            Live Database Sync Active
          </span>
        </div>

        {studentRecords.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Users}
              title="No student records found"
              description="No student profiles match the selected branch, section, or assignment filters."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-900/80 text-[11px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100 dark:border-slate-700">
                    <th className="py-4 px-6">Reg No</th>
                    <th className="py-4 px-6">Student Name</th>
                    <th className="py-4 px-6">Branch</th>
                    <th className="py-4 px-6">Section</th>
                    <th className="py-4 px-6">Assignment</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Submitted At</th>
                    <th className="py-4 px-6">Marks</th>
                    <th className="py-4 px-6">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm font-medium">
                  {paginatedRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{r.regNo}</td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-[#0B1E43] dark:text-white">{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.email}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg">
                          {r.branch}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-300 font-semibold">{r.section}</td>
                      <td className="py-4 px-6 max-w-[200px] truncate text-slate-700 dark:text-slate-300 font-semibold" title={r.assignmentTitle}>
                        {r.assignmentTitle}
                      </td>
                      <td className="py-4 px-6">
                        {r.isCompleted ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 hover:bg-emerald-100 border-none font-bold text-xs px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {r.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 font-bold text-xs px-2.5 py-0.5 rounded-full">
                            <Clock className="mr-1 h-3 w-3" />
                            Not Completed
                          </Badge>
                        )}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 dark:text-slate-400 font-medium">{r.submittedAt}</td>
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{r.marks}</td>
                      <td className="py-4 px-6 font-extrabold text-amber-600 dark:text-amber-400">
                        {r.credits > 0 ? `+${r.credits}` : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                Showing {studentRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
                {Math.min(currentPage * pageSize, studentRecords.length)} of {studentRecords.length} records
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl h-9 text-xs font-bold border-slate-200 dark:border-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <span className="text-xs font-extrabold px-3 py-1 bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-xl h-9 text-xs font-bold border-slate-200 dark:border-slate-700"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
