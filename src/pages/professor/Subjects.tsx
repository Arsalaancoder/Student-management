// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  BookOpen, Users, Plus, ArrowRight, Loader2, Search, X, 
  FileText, CheckCircle2, AlertCircle 
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface SubjectData {
  id: string
  code: string
  name: string
  description: string | null
  enrolledCount: number
  assignmentCount: number
}

interface CreateSubjectForm {
  name: string
  code: string
  description: string
}

interface FormErrors {
  name?: string
  code?: string
}

export default function ProfessorSubjects() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<SubjectData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateSubjectForm>({ name: "", code: "", description: "" })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const fetchSubjects = async () => {
    if (!profile) return
    try {
      setLoading(true)

      const { data: subjectsData, error } = await supabase
        .from("subjects")
        .select("id, code, name, description")
        .eq("professor_id", profile.id)
        .order("name")

      if (error) throw error

      if (subjectsData && subjectsData.length > 0) {
        const subjectIds = subjectsData.map(s => s.id)

        const [{ data: enrollmentsData }, { data: assignmentsData }] = await Promise.all([
          supabase.from("enrollments").select("subject_id").in("subject_id", subjectIds),
          supabase.from("assignments").select("subject_id").in("subject_id", subjectIds)
        ])

        const enrollCount: Record<string, number> = {}
        enrollmentsData?.forEach(e => {
          if (e.subject_id) enrollCount[e.subject_id] = (enrollCount[e.subject_id] || 0) + 1
        })

        const assignCount: Record<string, number> = {}
        assignmentsData?.forEach(a => {
          if (a.subject_id) assignCount[a.subject_id] = (assignCount[a.subject_id] || 0) + 1
        })

        setSubjects(subjectsData.map(s => ({
          ...s,
          enrolledCount: enrollCount[s.id] || 0,
          assignmentCount: assignCount[s.id] || 0,
        })))
      } else {
        setSubjects([])
      }
    } catch (err) {
      console.error("Error fetching subjects:", err)
      toast.error("Failed to load subjects")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile) fetchSubjects()
  }, [profile])

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!form.name.trim()) errors.name = "Subject name is required."
    if (!form.code.trim()) errors.code = "Subject code is required."
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!validate()) return

    try {
      setCreating(true)
      const { error } = await supabase.from("subjects").insert({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        professor_id: profile.id,
      })

      if (error) {
        if (error.code === "23505") {
          setFormErrors({ code: "A subject with this code already exists." })
          return
        }
        throw error
      }

      toast.success(`Subject "${form.name}" created successfully!`)
      setForm({ name: "", code: "", description: "" })
      setShowCreateForm(false)
      await fetchSubjects()
    } catch (err: any) {
      console.error("Error creating subject:", err)
      toast.error(err.message || "Failed to create subject")
    } finally {
      setCreating(false)
    }
  }

  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-5 w-64 rounded-lg" />
          </div>
          <Skeleton className="h-11 w-40 rounded-2xl" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56 w-full rounded-[2rem]" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">My Subjects</h1>
          <p className="text-muted-foreground mt-1">Manage your subjects and create assignments.</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subjects..."
              className="pl-9 bg-white border-muted/50 rounded-2xl h-11"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            className="h-11 rounded-2xl px-6 font-bold shadow-sm gap-2 flex-shrink-0"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-4 w-4" /> Create Subject
          </Button>
        </div>
      </div>

      {/* Create Subject Form */}
      {showCreateForm && (
        <Card className="border-2 border-primary/20 shadow-sm rounded-[2rem] animate-in slide-in-from-top-2 duration-300">
          <CardHeader className="p-8 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Create New Subject</CardTitle>
              <CardDescription>Add a subject you teach to start creating assignments.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => {
              setShowCreateForm(false)
              setForm({ name: "", code: "", description: "" })
              setFormErrors({})
            }}>
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleCreate} noValidate className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#0B1E43]">Subject Name *</label>
                  <Input
                    placeholder="e.g. Machine Learning"
                    value={form.name}
                    onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormErrors(p => ({ ...p, name: undefined })) }}
                    className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 ${formErrors.name ? "ring-2 ring-red-400" : ""}`}
                  />
                  {formErrors.name && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#0B1E43]">Subject Code *</label>
                  <Input
                    placeholder="e.g. ML301"
                    value={form.code}
                    onChange={e => { setForm(p => ({ ...p, code: e.target.value })); setFormErrors(p => ({ ...p, code: undefined })) }}
                    className={`h-12 bg-[#F4F7FE] border-none rounded-2xl focus-visible:ring-primary/20 ${formErrors.code ? "ring-2 ring-red-400" : ""}`}
                  />
                  {formErrors.code && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{formErrors.code}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0B1E43]">Description</label>
                <textarea
                  placeholder="A brief description of this subject..."
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="bg-[#F4F7FE] border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none w-full p-4 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" className="rounded-full px-6 font-bold" onClick={() => {
                  setShowCreateForm(false)
                  setForm({ name: "", code: "", description: "" })
                  setFormErrors({})
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="rounded-full px-8 font-bold bg-[#1E5EFF] hover:bg-blue-700">
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Create Subject</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Subject Cards */}
      {filteredSubjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={searchQuery ? "No subjects match your search" : "No subjects yet"}
          description={searchQuery ? "Try a different search term." : "Create your first subject to start building assignments for your students."}
          action={{ label: "Create Your First Subject", onClick: () => setShowCreateForm(true) }}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredSubjects.map(subject => (
            <Card key={subject.id} className="border-none shadow-sm rounded-[2rem] overflow-hidden flex flex-col group hover:shadow-md hover:-translate-y-1 transition-all duration-300">
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
                  <CardDescription className="mt-2 line-clamp-2">{subject.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-6 pt-4 flex-1 flex flex-col justify-end">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Students</span>
                      <span className="font-extrabold text-[#0B1E43]">{subject.enrolledCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Assignments</span>
                      <span className="font-extrabold text-[#0B1E43]">{subject.assignmentCount}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild className="flex-1 rounded-xl bg-[#1E5EFF] hover:bg-blue-700 font-bold">
                    <Link to={`/professor/subjects/${subject.id}`}>
                      Open Subject <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl border-muted/50 hover:border-primary/30">
                    <Link to={`/professor/subjects/${subject.id}/assignments/create`}>
                      <Plus className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
