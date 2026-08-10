import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface MlopsEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function MlopsEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: MlopsEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/15 px-4 py-6 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card">
        <Icon strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
