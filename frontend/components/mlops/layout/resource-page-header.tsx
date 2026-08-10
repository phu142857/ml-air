import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ResourceAccent = "emerald" | "sky" | "amber" | "violet" | "zinc"

/** Neutral GitHub-style header — accent prop kept for API compatibility. */
const headerIconStyles = {
  wash: "bg-muted/60",
  icon: "text-muted-foreground",
} as const

interface ResourcePageHeaderProps {
  icon: LucideIcon
  accent: ResourceAccent
  title: string
  /** Optional metadata only (id, path). Avoid instructional copy. */
  subtitle?: string
  actions?: React.ReactNode
  leading?: React.ReactNode
  className?: string
}

/** Standard header action button classes for ResourcePageHeader. */
export const pageHeaderActionClass =
  "h-8 gap-1.5 border-border bg-card text-xs text-muted-foreground hover:text-foreground"

export function ResourcePageHeader({
  icon: Icon,
  accent: _accent,
  title,
  subtitle,
  actions,
  leading,
  className,
}: ResourcePageHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-[1] shrink-0 border-b border-border bg-background px-4 py-2.5 sm:px-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {leading}
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60",
              headerIconStyles.wash,
            )}
          >
            <Icon strokeWidth={1.75} className={cn("h-3.5 w-3.5", headerIconStyles.icon)} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
