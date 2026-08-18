import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ActionProp {
  label: string
  onClick: () => void
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ActionProp | React.ReactNode
}

function isActionObject(action: any): action is ActionProp {
  return action && typeof action === "object" && "label" in action && "onClick" in action
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
      <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border border-slate-100">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mt-2 max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {isActionObject(action) ? (
            <Button onClick={action.onClick} className="rounded-full font-bold">
              {action.label}
            </Button>
          ) : (
            action as React.ReactNode
          )}
        </div>
      )}
    </div>
  )
}
