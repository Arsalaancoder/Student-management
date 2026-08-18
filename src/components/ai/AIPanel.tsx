import { useState } from "react"
import { Sparkles, Copy, Check, RotateCw, AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AIPanelProps {
  title?: string
  content: string | null
  loading: boolean
  error: string | null
  onRegenerate?: () => void
  onClose?: () => void
}

export default function AIPanel({ title = "AI Assistant", content, loading, error, onRegenerate, onClose }: AIPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!loading && !content && !error) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-100/50 bg-white/50 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-indigo-700">
          <Sparkles className="h-5 w-5" />
          <h3 className="font-semibold">{title}</h3>
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
            AI-Generated
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onRegenerate && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-400 hover:text-indigo-700" onClick={onRegenerate} disabled={loading}>
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {content && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-400 hover:text-indigo-700" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-indigo-100/80"></div>
            <div className="h-4 w-full animate-pulse rounded bg-indigo-100/60"></div>
            <div className="h-4 w-5/6 animate-pulse rounded bg-indigo-100/60"></div>
            <div className="h-4 w-1/2 animate-pulse rounded bg-indigo-100/40"></div>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-red-600">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="prose prose-sm prose-indigo max-w-none">
            <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
              {content}
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      {!loading && !error && (
        <div className="bg-indigo-50/30 px-5 py-3 text-xs text-indigo-500/80">
          AI generated content may contain inaccuracies. Please review independently.
        </div>
      )}
    </div>
  )
}
