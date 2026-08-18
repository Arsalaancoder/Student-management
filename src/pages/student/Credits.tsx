// @ts-nocheck
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, TrendingUp, Zap, History, ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

interface Transaction {
  id: string
  credits: number
  description: string
  created_at: string
  source_id?: string
  subject_name?: string
}

export default function StudentCredits() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalCredits, setTotalCredits] = useState(0)

  useEffect(() => {
    if (!profile) return

    const fetchCredits = async () => {
      try {
        setLoading(true)
        // Fetch all credit transactions
        const { data, error } = (await supabase
          .from("credit_transactions")
          .select(`
            *,
            submissions:submission_id (
              assignment_id,
              assignments (
                title,
                subjects (name)
              )
            )
          `)
          .eq("student_id" as any, profile.id)
          .order("created_at", { ascending: false })) as any

        if (error) throw error

        let sum = 0
        const formattedTx: Transaction[] = (data || []).map((tx: any) => {
          const credits = Number(tx.credits) || 0
          sum += credits
          return {
            id: tx.id,
            credits,
            description: tx.submissions?.assignments?.title || "Credit Awarded",
            created_at: tx.created_at,
            source_id: tx.submissions?.assignment_id,
            subject_name: tx.submissions?.assignments?.subjects?.name
          }
        })

        setTransactions(formattedTx)
        setTotalCredits(sum)

      } catch (error) {
        console.error("Error fetching credits:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCredits()
  }, [profile])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1E43]">Credit Wallet</h1>
        <p className="text-muted-foreground mt-1">Track your academic currency and achievements.</p>
      </div>

      {/* Credit Balance Card */}
      <div className="bg-gradient-to-br from-[#FFF4E5] to-[#FFE8C4] rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between border border-[#FFD699]">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-white/50 rounded-2xl backdrop-blur-sm">
              <Zap className="h-6 w-6 text-[#FFB020]" />
            </div>
            <span className="font-bold text-[#D98A00] tracking-wide uppercase text-sm">Total Balance</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-7xl font-black text-[#8C5A00] tracking-tighter drop-shadow-sm">{totalCredits}</span>
            <span className="text-2xl font-bold text-[#D98A00]">CR</span>
          </div>
          <p className="text-[#A66A00] font-medium mt-4 max-w-sm">
            Keep completing assignments and earning top grades to grow your academic wealth.
          </p>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <TrendingUp className="absolute -right-10 -bottom-10 w-64 h-64 text-[#FFB020] opacity-10 drop-shadow-2xl" />
      </div>

      {/* Transaction History */}
      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardHeader className="p-8 pb-4 flex flex-row items-center gap-3">
          <History className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl m-0">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {transactions.length === 0 ? (
            <div className="text-center p-12 bg-muted/30 rounded-[2rem] border border-dashed border-muted">
              <div className="mx-auto h-16 w-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Zap className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1E43]">No credits yet</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Submit assignments and receive grades from your professors to start earning academic credits.
              </p>
              <Button asChild className="mt-6 rounded-full font-bold">
                <Link to="/student/assignments">View Assignments</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-5 border border-muted/50 rounded-2xl bg-white hover:border-primary/20 hover:shadow-sm transition-all group">
                  
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#0B1E43] group-hover:text-primary transition-colors">
                        {tx.description}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {tx.subject_name && (
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-600">
                            {tx.subject_name}
                          </span>
                        )}
                        <p className="text-sm font-medium text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString('en-US', { 
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="px-4 py-2 rounded-xl bg-green-50 text-green-700 font-bold border border-green-200">
                      +{tx.credits} CR
                    </div>
                    {tx.source_id && (
                      <Link to={`/student/assignments/${tx.source_id}`} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors">
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
