// @ts-nocheck
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, ShieldAlert, CheckCircle, Search } from "lucide-react"
import { toast } from "sonner"

export default function SimilarityReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [submission, setSubmission] = useState<any>(null)
  const [selectedMatch, setSelectedMatch] = useState<any>(null)

  useEffect(() => {
    if (!profile || !id) return

    const fetchReport = async () => {
      try {
        setLoading(true)

        // 1. Fetch submission details
        const { data: subData, error: subError } = await supabase
          .from("submissions")
          .select(`
            *,
            profiles:student_id (full_name, student_id),
            assignments (title)
          `)
          .eq("id", id)
          .single()
          
        if (subError) throw subError
        setSubmission(subData)

        // 2. Fetch plagiarism report
        const { data: reportData } = await supabase
          .from("plagiarism_reports")
          .select("*")
          .eq("submission_id", id)
          .single()

        if (reportData) {
          setReport(reportData)
          const repData = reportData.report_data as any
          if (repData?.matches && repData.matches.length > 0) {
            setSelectedMatch(repData.matches[0])
          }
        }

      } catch (error) {
        console.error("Error fetching similarity report:", error)
        toast.error("Failed to load similarity report")
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [profile, id])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!report || !submission) {
    return (
      <div className="text-center py-20 space-y-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground mx-auto" />
        <h2 className="text-2xl font-bold">No Similarity Report Available</h2>
        <p className="text-muted-foreground">The report might still be processing or was not generated.</p>
        <Button onClick={() => navigate(-1)} className="mt-4">Go Back</Button>
      </div>
    )
  }

  const { similarity_percentage, status } = report
  const report_data = report.report_data as any
  const matches = report_data?.matches || []
  
  if (status === "processing_failed") {
    return (
      <div className="text-center py-20 space-y-4">
        <ShieldAlert className="h-16 w-16 text-red-500 mx-auto" />
        <h2 className="text-2xl font-bold text-red-700">Similarity Check Failed</h2>
        <p className="text-red-600 bg-red-50 p-4 rounded-xl max-w-lg mx-auto border border-red-100 font-mono text-sm">
          {report_data?.error || "Unknown text extraction error."}
        </p>
        <Button onClick={() => navigate(-1)} className="mt-4">Go Back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 max-w-[1400px] mx-auto h-[calc(100vh-100px)] flex flex-col">
      
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Academic Integrity Report</h1>
            <p className="text-muted-foreground mt-1">
              Target Student: <span className="font-semibold text-foreground">{submission.profiles?.full_name}</span> 
              <span className="mx-2">•</span> 
              Assignment: <span className="font-semibold text-foreground">{submission.assignments?.title}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Overall Similarity</span>
            <span className={`text-2xl font-black ${similarity_percentage > 50 ? 'text-red-600' : similarity_percentage > 20 ? 'text-yellow-600' : 'text-green-600'}`}>
              {similarity_percentage}%
            </span>
          </div>
          <div className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Risk Level</span>
            <span className={`text-lg font-black mt-1 ${report_data?.risk_level === 'High' || report_data?.risk_level === 'Very High' ? 'text-red-600' : report_data?.risk_level === 'Moderate' ? 'text-yellow-600' : 'text-green-600'}`}>
              {report_data?.risk_level || "Unknown"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Sidebar: Matched Sources List */}
        <div className="col-span-3 flex flex-col space-y-4">
          <Card className="border-none shadow-sm rounded-3xl bg-white flex-1 overflow-hidden flex flex-col">
            <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">Matching Submissions ({matches.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto custom-scrollbar flex-1">
              {matches.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
                  <p className="font-bold text-green-700">No significant similarity detected.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {matches.map((match: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => setSelectedMatch(match)}
                      className={`w-full text-left p-5 transition-colors hover:bg-slate-50 flex items-center justify-between ${selectedMatch?.matching_submission_id === match.matching_submission_id ? 'bg-indigo-50/50 border-l-4 border-indigo-500' : ''}`}
                    >
                      <div>
                        <p className="font-bold text-[#0B1E43] truncate">{match.student_name}</p>
                        <p className="text-xs text-slate-500 mt-1 font-medium">{match.method}</p>
                      </div>
                      <span className={`text-lg font-black ${match.similarity_percentage > 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {match.similarity_percentage}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Area: Side-by-side comparison */}
        <div className="col-span-9 flex flex-col space-y-4">
          <Card className="border-none shadow-sm rounded-3xl bg-white flex-1 overflow-hidden flex flex-col">
            <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Search className="h-4 w-4 text-indigo-500" />
                Side-by-Side Comparison
              </CardTitle>
              {selectedMatch && (
                <div className="px-3 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-lg text-xs">
                  Match Similarity: {selectedMatch.similarity_percentage}%
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 grid grid-cols-2 divide-x divide-slate-200 overflow-hidden">
              
              {/* Target Text Pane */}
              <div className="flex flex-col h-full bg-slate-50/30">
                <div className="p-4 bg-white border-b border-slate-100 shrink-0">
                  <h3 className="font-bold text-[#0B1E43] text-sm truncate">{submission.profiles?.full_name}'s Submission</h3>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 prose prose-sm max-w-none text-slate-700">
                  {selectedMatch ? (
                    <div className="whitespace-pre-wrap font-serif leading-relaxed text-[15px]">
                      {/* Simulating highlighting by adding background to the preview text */}
                      <span className={`${selectedMatch.similarity_percentage > 20 ? 'bg-red-100/60 decoration-red-200' : ''}`}>
                        {selectedMatch.target_text_preview}
                      </span>
                      {selectedMatch.target_text_preview.length === 500 && "..."}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Select a matching submission to view comparison.</p>
                  )}
                </div>
              </div>

              {/* Matched Text Pane */}
              <div className="flex flex-col h-full bg-slate-50/30">
                <div className="p-4 bg-white border-b border-slate-100 shrink-0">
                  <h3 className="font-bold text-[#0B1E43] text-sm truncate">{selectedMatch ? `${selectedMatch.student_name}'s Submission` : 'Matching Source'}</h3>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 prose prose-sm max-w-none text-slate-700">
                  {selectedMatch ? (
                    <div className="whitespace-pre-wrap font-serif leading-relaxed text-[15px]">
                       <span className={`${selectedMatch.similarity_percentage > 20 ? 'bg-red-100/60 decoration-red-200' : ''}`}>
                        {selectedMatch.matched_text_preview}
                      </span>
                      {selectedMatch.matched_text_preview.length === 500 && "..."}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Select a matching submission to view comparison.</p>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>
          
          {/* Methodology Info */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex gap-6 text-sm">
            <div>
              <span className="font-bold text-slate-700 block mb-1">Detection Methods</span>
              <ul className="text-slate-600 list-disc list-inside">
                {report_data?.methods_used?.map((m: string) => <li key={m}>{m}</li>)}
              </ul>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-1">Semantic Similarity</span>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-bold uppercase tracking-wider">
                {report_data?.semantic_similarity || "Unavailable"}
              </span>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
