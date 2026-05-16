import { cn } from "@/lib/utils"

interface DetailSectionProps {
  title: string
  description?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  accentBorder?: "amber" | "emerald" | "sky" | "violet" | "none"
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
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card/80 overflow-hidden",
        accentBorder === "amber" && "border-l-2 border-l-amber-500/60",
        accentBorder === "emerald" && "border-l-2 border-l-emerald-500/60",
        accentBorder === "sky" && "border-l-2 border-l-sky-500/60",
        accentBorder === "violet" && "border-l-2 border-l-violet-500/60",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border/80">
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {headerActions && <div className="flex items-center gap-2 shrink-0">{headerActions}</div>}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}
