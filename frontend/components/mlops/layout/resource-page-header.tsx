import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ResourceAccent = "emerald" | "sky" | "amber" | "violet" | "zinc"

const primaryAccent = {
  wash: "bg-primary/10",
  icon: "text-primary",
} as const

const accentStyles: Record<ResourceAccent, { wash: string; icon: string }> = {
  emerald: primaryAccent,
  sky: primaryAccent,
  amber: primaryAccent,
  violet: primaryAccent,
  zinc: {
    wash: "bg-muted/60",
    icon: "text-muted-foreground",
  },
}

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
  accent,
  title,
  subtitle,
  actions,
  leading,
  className,
}: ResourcePageHeaderProps) {
  const styles = accentStyles[accent]

  return (
    <header
      className={cn(
        "relative z-[1] shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              styles.wash,
            )}
          >
            <Icon strokeWidth={1.75} className={cn("h-4 w-4", styles.icon)} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading truncate text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
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
