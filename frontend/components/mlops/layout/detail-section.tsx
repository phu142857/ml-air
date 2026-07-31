import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

interface DetailSectionProps {
  title?: string
  /** Prefer omitting; keep only when the field group is non-obvious. */
  description?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  accentBorder?: "amber" | "emerald" | "sky" | "violet" | "none"
}

const accentBorderClass: Record<NonNullable<DetailSectionProps["accentBorder"]>, string> = {
  none: "",
  amber: "border-l-[3px] border-l-primary/45",
  emerald: "border-l-[3px] border-l-primary/45",
  sky: "border-l-[3px] border-l-primary/50",
  violet: "border-l-[3px] border-l-primary/45",
}

export function DetailSection({
  title,
  description,
  headerActions,
  children,
  className,
  bodyClassName,
  accentBorder = "none",
}: DetailSectionProps) {
  const showHeader = Boolean(title || description || headerActions)

  return (
    <Panel padded={false} className={className}>
      <div className={cn("min-w-0", accentBorderClass[accentBorder])}>
        {showHeader ? (
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
              ) : null}
              {description ? (
                <p className={cn("text-xs text-muted-foreground", title && "mt-0.5")}>{description}</p>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex shrink-0 items-center gap-1.5">{headerActions}</div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("p-4", bodyClassName)}>{children}</div>
      </div>
    </Panel>
  )
}
