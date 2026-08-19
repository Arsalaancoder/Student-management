// @ts-nocheck
import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Eye, 
  Filter, 
  Layers 
} from "lucide-react"
import { toast } from "sonner"
import { 
  PLAGIARISM_CONFIG, 
  getSimilarityStatus, 
  getSimilarityStatusBadge 
} from "@/lib/plagiarismConfig"
import { triggerPlagiarismRetry } from "@/lib/plagiarismApi"

export default function PlagiarismMonitor() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const [submissions, setSubmissions] = useState<any[]>([])
  const [suspiciousPairs, setSuspiciousPairs] = useState<any[]>([])

  useEffect(() => {
    if (!profile) return

    const fetchData = async () => {
      try {
        setLoading(true)

        // 1. Fetch Assignments created by or taught by professor
        const { data: assignData, error: assignError } = await supabase
          .from("assignments")
          .select("id, title, subject_name, subjects(name)")
          .order("created_at", { ascending: false })

        if (assignError) throw assignError
        setAssignments(assignData || [])

        // 2. Fetch Submissions with plagiarism reports and profile metadata
        let query = supabase
          .from("submissions")
          .select(`
            id,
            assignment_id,
            student_id,
            similarity_score,
            submitted_at,
            status,
            assignments (
              id,
              title,
              subject_name,
              subjects (name)
            ),
            profiles:student_id (
              id,
              full_name,
              student_id,
              email,
              department,
              year,
              section,
              profile_photo_url
            ),
            plagiarism_reports (
              id,
              similarity_percentage,
              status,
              report_data,
              created_at
            )
          `)
          .order("submitted_at", { ascending: false })

        if (selectedAssignmentId !== "all") {
          query = query.eq("assignment_id", selectedAssignmentId)
        }

        const { data: subsData, error: subsError } = await query
        if (subsError) throw subsError

        // Process Submissions & Calculate Suspicious Pairs
        const formattedSubmissions: any[] = []
        const pairsMap = new Map<string, any>()

        subsData?.forEach((sub: any) => {
          const report = sub.plagiarism_reports?.[0] || null
          const reportData = report?.report_data || {}
          const matches = reportData.matches || []
          
          const studentProf = sub.profiles || {}
          const studentName = studentProf.full_name || studentProf.email || (studentProf.student_id ? `Student (${studentProf.student_id})` : "Student")

          const highestMatch = matches.length > 0 ? matches[0] : null
          const status = getSimilarityStatus(
            report ? report.similarity_percentage : sub.similarity_score, 
            report?.status === 'processing_failed'
          )

          formattedSubmissions.push({
            id: sub.id,
            assignmentId: sub.assignment_id,
            assignmentTitle: sub.assignments?.title || "Assignment",
            subjectName: sub.assignments?.subject_name || sub.assignments?.subjects?.name || "General",
            studentId: studentProf.student_id || "N/A",
            studentName: studentName,
            department: studentProf.department || "N/A",
            year: studentProf.year ? `${studentProf.year} Yr` : "N/A",
            section: studentProf.section ? `Sec ${studentProf.section}` : "N/A",
            submittedAt: sub.submitted_at,
            similarityScore: report ? report.similarity_percentage : sub.similarity_score,
            reportStatus: report?.status || 'none',
            statusCategory: status,
            highestMatch: highestMatch,
            matchedStudentName: highestMatch ? highestMatch.student_name : '—',
            reportData: reportData
          })

          // Build Pair Matrix
          matches.forEach((m: any) => {
            if (m.similarity_percentage >= PLAGIARISM_CONFIG.REVIEW_THRESHOLD) {
              const studentA = studentName
              const studentB = m.student_name
              // Create deterministic key so (A, B) and (B, A) aggregate cleanly
              const pairKey = [studentA, studentB].sort().join(" vs ")
              
              if (!pairsMap.has(pairKey) || pairsMap.get(pairKey).similarity < m.similarity_percentage) {
                pairsMap.set(pairKey, {
                  pairKey,
                  studentA,
                  studentB,
                  similarity: m.similarity_percentage,
                  lexical: m.lexical_score || 0,
                  semantic: m.semantic_score || 0,
                  assignmentTitle: sub.assignments?.title || "Assignment",
                  submissionId: sub.id,
                  matchedSubmissionId: m.matching_submission_id,
                  status: getSimilarityStatus(m.similarity_percentage)
                })
              }
            }
          })
        })

        setSubmissions(formattedSubmissions)

        // Sort Suspicious Pairs highest similarity first
        const sortedPairs = Array.from(pairsMap.values()).sort((a, b) => b.similarity - a.similarity)
        setSuspiciousPairs(sortedPairs)

      } catch (error: any) {
        console.error("Error fetching plagiarism data:", error)
        toast.error("Failed to load plagiarism monitor data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile, selectedAssignmentId])

  const handleRetry = async (submissionId: string) => {
    try {
      setRetryingId(submissionId)
      toast.info("Retrying similarity analysis...")
      const res = await triggerPlagiarismRetry(submissionId)
      toast.success("Similarity analysis completed successfully!")
      
      // Update local item
      setSubmissions(prev => prev.map(s => {
        if (s.id === submissionId) {
          const sim = res.similarity ?? 0
          return {
            ...s,
            similarityScore: sim,
            reportStatus: 'completed',
            statusCategory: getSimilarityStatus(sim)
          }
        }
        return s
      }))
    } catch (err: any) {
      console.error("Retry failed:", err)
      toast.error(err.message || "Failed to retry analysis")
    } finally {
      setRetryingId(null)
    }
  }

  const filteredSubmissions = submissions.filter(s =>
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.assignmentTitle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Metrics Counters
  const totalSubmissions = submissions.length
  const lowCount = submissions.filter(s => s.statusCategory === 'low').length
  const reviewCount = submissions.filter(s => s.statusCategory === 'review').length
  const highCount = submissions.filter(s => s.statusCategory === 'high').length

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-6 w-6 text-indigo-600" />
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold uppercase tracking-wide">
              Academic Integrity System
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0B1E43]">Assignment Similarity Monitor</h1>
          <p className="text-muted-foreground mt-1">Review potential text and semantic matches across student submissions.</p>
        </div>

        {/* Assignment Filter Selector */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />
          <select
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            className="h-11 px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-semibold text-[#0B1E43] focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
          >
            <option value="all">All Assignments ({assignments.length})</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.subject_name || a.subjects?.name || "General"})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics Summary Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-none shadow-xs rounded-[2rem] bg-white p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Analyzed</span>
            <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-[#0B1E43] mt-3">{totalSubmissions}</p>
          <span className="text-xs font-semibold text-slate-400 mt-1 block">Submissions checked</span>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-emerald-50/60 border border-emerald-100 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Low Similarity</span>
            <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-700 mt-3">{lowCount}</p>
          <span className="text-xs font-semibold text-emerald-600 mt-1 block">0% – 29% Match</span>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-amber-50/60 border border-amber-100 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Needs Review</span>
            <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-700 mt-3">{reviewCount}</p>
          <span className="text-xs font-semibold text-amber-600 mt-1 block">30% – 69% Match</span>
        </Card>

        <Card className="border-none shadow-xs rounded-[2rem] bg-red-50/60 border border-red-100 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-800">High Similarity</span>
            <div className="h-10 w-10 bg-red-100 rounded-xl flex items-center justify-center text-red-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-red-700 mt-3">{highCount}</p>
          <span className="text-xs font-semibold text-red-600 mt-1 block">70% – 100% Match</span>
        </Card>
      </div>

      {/* Suspicious Pairs Matrix Section */}
      {suspiciousPairs.length > 0 && (
        <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
          <CardHeader className="bg-slate-50/50 p-6 border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-[#0B1E43] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Suspicious Pair Matrix
            </CardTitle>
            <CardDescription>
              Student pairs flagged with potential textual or semantic overlap (sorted by highest match score).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Student A</th>
                    <th className="px-6 py-4">Student B</th>
                    <th className="px-6 py-4">Assignment</th>
                    <th className="px-6 py-4 text-center">Similarity</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suspiciousPairs.map((pair, idx) => {
                    const badge = getSimilarityStatusBadge(pair.status)
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-[#0B1E43]">{pair.studentA}</td>
                        <td className="px-6 py-4 font-bold text-[#0B1E43]">{pair.studentB}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{pair.assignmentTitle}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-lg font-black ${pair.similarity >= 70 ? 'text-red-600' : 'text-amber-600'}`}>
                            {pair.similarity}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.colorClass}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button asChild size="sm" className="rounded-full px-4 bg-[#1E5EFF] hover:bg-blue-700 font-bold">
                            <Link to={`/professor/submissions/${pair.submissionId}/similarity`}>
                              <Eye className="h-4 w-4 mr-1.5" /> View Comparison
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submissions List Table */}
      <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-[#0B1E43]">Submissions Similarity Audit</CardTitle>
            <CardDescription>Comprehensive list of submissions and their corresponding similarity results.</CardDescription>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search student or assignment..."
              className="pl-10 bg-white border-slate-200 rounded-full h-10 text-sm focus-visible:ring-primary/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-700 text-lg">No submissions match your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Assignment</th>
                    <th className="px-6 py-4">Submitted Date</th>
                    <th className="px-6 py-4 text-center">Highest Match</th>
                    <th className="px-6 py-4">Matched Student</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubmissions.map((sub) => {
                    const badge = getSimilarityStatusBadge(sub.statusCategory)
                    const isRetrying = retryingId === sub.id

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#0B1E43]">{sub.studentName}</div>
                          <div className="text-xs text-slate-500 font-medium">ID: {sub.studentId} &bull; {sub.department}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-800">{sub.assignmentTitle}</div>
                          <div className="text-xs text-slate-400 font-medium">{sub.subjectName}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-xs font-medium">
                          {new Date(sub.submittedAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {sub.similarityScore !== null && sub.similarityScore !== undefined ? (
                            <span className={`text-base font-black ${sub.similarityScore >= 70 ? 'text-red-600' : sub.similarityScore >= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {sub.similarityScore}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Processing</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {sub.matchedStudentName}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.colorClass}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-full h-8 px-3 text-xs font-bold border-slate-200 hover:bg-slate-100"
                            onClick={() => handleRetry(sub.id)}
                            disabled={isRetrying}
                          >
                            {isRetrying ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            )}
                            Retry
                          </Button>

                          <Button 
                            asChild 
                            size="sm" 
                            className="rounded-full h-8 px-4 text-xs font-bold bg-[#1E5EFF] hover:bg-blue-700"
                          >
                            <Link to={`/professor/submissions/${sub.id}/similarity`}>
                              View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
