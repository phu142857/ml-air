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
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className
      )}
    >
      <Icon className="h-10 w-10 text-muted-foreground/80 mb-3" aria-hidden />
      <h3 className="text-sm font-medium text-foreground/90">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
