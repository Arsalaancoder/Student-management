// @ts-nocheck
import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Users, Search, ArrowRight, BookMarked } from "lucide-react"

interface SubjectData {
  id: string
  code: string
  name: string
  description: string | null
  enrolledCount: number
}

export default function ProfessorClasses() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<SubjectData[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!profile) return

    const fetchSubjects = async () => {
      try {
        setLoading(true)
        
        // Fetch subjects assigned to this professor
        const { data: subjectsData, error } = await supabase
          .from("subjects")
          .select("id, code, name, description")
          .eq("professor_id", profile.id)
          .order("code")

        if (error) throw error

        if (subjectsData && subjectsData.length > 0) {
          const subjectIds = subjectsData.map(s => s.id)
          
          // Fetch enrollments for these subjects to get counts
          const { data: enrollmentsData } = await supabase
            .from("enrollments")
            .select("subject_id")
            .in("subject_id", subjectIds)

          const enrollmentsCountMap: Record<string, number> = {}
          enrollmentsData?.forEach(e => {
            if (e.subject_id) {
              enrollmentsCountMap[e.subject_id] = (enrollmentsCountMap[e.subject_id] || 0) + 1
            }
          })

          const formattedSubjects = subjectsData.map(s => ({
            ...s,
            enrolledCount: enrollmentsCountMap[s.id] || 0
          }))

          setSubjects(formattedSubjects)
        }
      } catch (error) {
        console.error("Error fetching classes:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubjects()
  }, [profile])

  const filteredSubjects = subjects.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">My Classes</h1>
          <p className="text-muted-foreground mt-1">Manage your assigned subjects and view enrolled students.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search classes..." 
            className="pl-9 bg-white border-muted/50 rounded-2xl h-11 focus-visible:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredSubjects.length === 0 ? (
          <div className="col-span-full text-center p-12 bg-white rounded-[2rem] border border-dashed border-muted/50 shadow-sm">
            <BookMarked className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold text-[#0B1E43]">No classes found</h3>
            <p className="text-muted-foreground mt-2">You haven't been assigned any subjects yet or none match your search.</p>
          </div>
        ) : (
          filteredSubjects.map((subject) => (
            <Card key={subject.id} className="border-none shadow-sm rounded-[2rem] overflow-hidden flex flex-col group hover:shadow-md transition-all duration-300">
              <div className="h-2 bg-gradient-to-r from-[#1E5EFF] to-[#8BB1FF]" />
              <CardHeader className="p-6 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg tracking-wider">
                    {subject.code}
                  </span>
                </div>
                <CardTitle className="text-xl leading-tight text-[#0B1E43] group-hover:text-[#1E5EFF] transition-colors">
                  {subject.name}
                </CardTitle>
                {subject.description && (
                  <CardDescription className="mt-2 line-clamp-2">
                    {subject.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-6 pt-4 flex-1 flex flex-col justify-end">
                
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Enrolled</span>
                      <span className="font-extrabold text-[#0B1E43] text-lg">{subject.enrolledCount}</span>
                    </div>
                  </div>
                </div>

                <Button asChild variant="outline" className="w-full rounded-xl border-muted/50 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all font-bold">
                  <Link to={`/professor/subjects/${subject.id}`}>
                    View Students <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

    </div>
  )
}
