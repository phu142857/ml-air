import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ResourceAccent = "emerald" | "sky" | "amber" | "violet" | "zinc"

const primaryAccent = {
  wash: "bg-primary/10",
  icon: "text-primary",
  ring: "ring-primary/25",
} as const

const accentStyles: Record<
  ResourceAccent,
  { wash: string; icon: string; ring: string }
> = {
  emerald: primaryAccent,
  sky: primaryAccent,
  amber: primaryAccent,
  violet: primaryAccent,
  zinc: {
    wash: "bg-muted/60",
    icon: "text-muted-foreground",
    ring: "ring-border/80",
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
    <header
      className={cn(
        "relative z-[1] shrink-0 border-b border-border/70 bg-background/60 px-4 py-5 backdrop-blur-sm sm:px-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="rounded-2xl bg-muted/40 p-1 ring-1 ring-border/60">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-lg ring-1",
                styles.wash,
                styles.ring,
              )}
            >
              <Icon strokeWidth={1.75} className={cn("h-5 w-5", styles.icon)} />
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
