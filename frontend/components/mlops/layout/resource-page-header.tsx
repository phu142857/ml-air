import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ResourceAccent = "emerald" | "sky" | "amber" | "violet" | "zinc"

const primaryAccent = {
  wash: "bg-primary/10",
  icon: "text-primary",
} as const

const accentStyles: Record<
  ResourceAccent,
  { wash: string; icon: string }
> = {
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
        "relative z-[1] shrink-0 border-b border-border bg-background px-4 py-5 sm:px-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              styles.wash,
            )}
          >
            <Icon strokeWidth={1.75} className={cn("h-5 w-5", styles.icon)} />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading truncate text-xl font-semibold tracking-tight text-foreground">
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
