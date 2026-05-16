import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ResourceAccent = "emerald" | "sky" | "amber" | "violet" | "zinc"

const accentStyles: Record<ResourceAccent, { gradient: string; border: string; icon: string }> = {
  emerald: {
    gradient: "from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/20",
    icon: "text-emerald-400",
  },
  sky: {
    gradient: "from-sky-500/20 to-sky-600/10",
    border: "border-sky-500/20",
    icon: "text-sky-400",
  },
  amber: {
    gradient: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/20",
    icon: "text-amber-400",
  },
  violet: {
    gradient: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/20",
    icon: "text-violet-400",
  },
  zinc: {
    gradient: "from-muted-foreground/15 to-muted/30",
    border: "border-border",
    icon: "text-muted-foreground",
  },
}

interface ResourcePageHeaderProps {
  icon: LucideIcon
  accent: ResourceAccent
  title: string
  subtitle?: string
  actions?: React.ReactNode
  leading?: React.ReactNode
  className?: string
}

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
    <header className={cn("border-b border-border bg-background/50 px-6 py-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {leading}
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br border",
              styles.gradient,
              styles.border
            )}
          >
            <Icon className={cn("h-5 w-5", styles.icon)} />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}
