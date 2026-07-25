import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

interface DetailSectionProps {
  title?: string
  description?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  accentBorder?: "amber" | "emerald" | "sky" | "violet" | "none"
}

const accentBorderClass: Record<
  NonNullable<DetailSectionProps["accentBorder"]>,
  string
> = {
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
  const showHeader = Boolean(title || description || headerActions);

  return (
    <Panel className={className}>
      <div className={cn("min-w-0", accentBorderClass[accentBorder])}>
        {showHeader ? (
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className={cn("break-words text-xs leading-relaxed text-muted-foreground", title && "mt-1")}>
                  {description}
                </p>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex shrink-0 items-center gap-2">
                {headerActions}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("p-5", bodyClassName)}>{children}</div>
      </div>
    </Panel>
  )
}
