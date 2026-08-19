import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, LogOut } from "lucide-react"
import EduTrackLogo from "@/components/EduTrackLogo"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React Error caught by ErrorBoundary:", error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F4F7FE] text-center">
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl max-w-md w-full space-y-6">
            <EduTrackLogo size="lg" className="mx-auto" />
            <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-[#0B1E43]">Application Error</h2>
              <p className="text-sm text-slate-500">
                An unexpected error occurred while rendering the page.
              </p>
              {this.state.error && (
                <p className="text-xs font-mono bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-left overflow-auto max-h-32">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                onClick={() => window.location.reload()} 
                className="flex-1 rounded-2xl bg-[#1E5EFF] py-6 text-sm font-bold"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Reload Page
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  localStorage.clear()
                  window.location.href = "/login"
                }} 
                className="flex-1 rounded-2xl border-slate-200 py-6 text-sm font-bold"
              >
                <LogOut className="mr-2 h-4 w-4" /> Return to Login
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
