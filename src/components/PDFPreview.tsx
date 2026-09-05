import { useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"
import { Button } from "@/components/ui/button"
import { 
  FileText, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  Loader2, 
  Eye, 
  Layers,
  XCircle
} from "lucide-react"

// Initialize pdfjs worker with CDN fallback for serverless/Vercel deployments
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '6.3.289'}/build/pdf.worker.min.mjs`
}

interface PDFPreviewProps {
  file: File
  onChangeFile: () => void
  onRemoveFile: () => void
  onValidationChange?: (isValid: boolean) => void
  maxSizeBytes?: number
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default function PDFPreview({
  file,
  onChangeFile,
  onRemoveFile,
  onValidationChange,
  maxSizeBytes = 15 * 1024 * 1024 // 15MB default limit
}: PDFPreviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [renderedPages, setRenderedPages] = useState<string[]>([])
  
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isCancelled = false
    setError(null)
    setLoading(true)
    setNumPages(null)
    setRenderedPages([])

    const validateAndRenderPDF = async () => {
      // 1. Oversized file check
      if (file.size > maxSizeBytes) {
        const err = `File size (${formatFileSize(file.size)}) exceeds the maximum allowed limit of ${formatFileSize(maxSizeBytes)}.`
        setError(err)
        setLoading(false)
        onValidationChange?.(false)
        return
      }

      // 2. File extension / MIME type check
      const fileNameLower = file.name.toLowerCase()
      const isPdfExtension = fileNameLower.endsWith(".pdf")
      const isPdfMime = file.type === "application/pdf" || file.type === ""

      if (!isPdfExtension && !isPdfMime) {
        const err = "Unsupported file type. Please select a valid PDF file (.pdf)."
        setError(err)
        setLoading(false)
        onValidationChange?.(false)
        return
      }

      try {
        const arrayBuffer = await file.arrayBuffer()
        
        // Quick magic number check for PDF header (%PDF-)
        const headerArr = new Uint8Array(arrayBuffer.slice(0, 5))
        const headerStr = String.fromCharCode(...headerArr)
        if (headerStr !== "%PDF-") {
          throw new Error("Invalid PDF header. The file structure is damaged or not a real PDF.")
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise

        if (isCancelled) return

        const pageCount = pdf.numPages
        setNumPages(pageCount)

        // Render each page to Data URL canvas image for stable React rendering & scrolling
        const pageDataUrls: string[] = []

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          if (isCancelled) return
          const page = await pdf.getPage(pageNum)

          // Use viewport width scale suited for container
          const unscaledViewport = page.getViewport({ scale: 1.0 })
          // Set standard target width of 800px for high quality rendering
          const scale = 800 / unscaledViewport.width
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement("canvas")
          const context = canvas.getContext("2d")
          canvas.height = viewport.height
          canvas.width = viewport.width

          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport,
              canvas: canvas
            }).promise
            pageDataUrls.push(canvas.toDataURL("image/png"))
          }
        }

        if (!isCancelled) {
          setRenderedPages(pageDataUrls)
          setLoading(false)
          onValidationChange?.(true)
        }
      } catch (err: any) {
        console.error("PDF Parsing/Rendering Error:", err)
        if (!isCancelled) {
          const errMsg = err?.message?.includes("Invalid PDF") 
            ? "Corrupted or invalid PDF file. This file cannot be opened."
            : err?.message || "Failed to render PDF preview. File may be corrupted or password protected."
          setError(errMsg)
          setLoading(false)
          onValidationChange?.(false)
        }
      }
    }

    validateAndRenderPDF()

    return () => {
      isCancelled = true
    }
  }, [file, maxSizeBytes])

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Top Banner Notice */}
      {!error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-5 py-3.5 rounded-2xl flex items-center gap-3 text-sm font-medium">
          <Eye className="h-5 w-5 text-amber-600 shrink-0" />
          <span>Please review your PDF carefully before submitting.</span>
        </div>
      )}

      {/* Selected File Metadata Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
            error ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
          }`}>
            {error ? <XCircle className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 text-base truncate">{file.name}</h4>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
              <span className="font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                {formatFileSize(file.size)}
              </span>
              {numPages !== null && (
                <span className="font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {numPages} {numPages === 1 ? "page" : "pages"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangeFile}
            className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100 gap-1.5 font-semibold text-xs h-9"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Change File
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemoveFile}
            className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5 font-semibold text-xs h-9"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove File
          </Button>
        </div>
      </div>

      {/* Error View */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <div>
            <h5 className="font-bold text-red-900 text-base">File Verification Failed</h5>
            <p className="text-sm text-red-700 mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onChangeFile}
              className="rounded-xl border-red-300 text-red-800 hover:bg-red-100 font-semibold"
            >
              Choose Another File
            </Button>
          </div>
        </div>
      )}

      {/* Loading View */}
      {loading && !error && (
        <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center bg-slate-50/50 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Generating PDF preview and counting pages...</p>
        </div>
      )}

      {/* PDF Pages Scroll View */}
      {!loading && !error && renderedPages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
            <span>Scroll to preview all pages</span>
            <span>Total Pages: {numPages}</span>
          </div>

          <div
            ref={containerRef}
            className="max-h-[550px] overflow-y-auto rounded-2xl bg-slate-200/70 p-4 border border-slate-300 shadow-inner space-y-4 scrollbar-thin scrollbar-thumb-slate-400"
          >
            {renderedPages.map((pageDataUrl, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col items-center mx-auto max-w-full"
              >
                <img
                  src={pageDataUrl}
                  alt={`PDF Page ${index + 1}`}
                  className="w-full h-auto object-contain max-w-full block"
                  loading="lazy"
                />
                <div className="w-full bg-slate-50 border-t border-slate-100 py-2 text-center text-xs font-bold text-slate-500">
                  Page {index + 1} of {numPages}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
