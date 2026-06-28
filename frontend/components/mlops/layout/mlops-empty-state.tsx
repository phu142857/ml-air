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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 rounded-2xl bg-muted/40 p-1 ring-1 ring-border/60">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-card">
          <Icon
            strokeWidth={1.5}
            className="h-5 w-5 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
