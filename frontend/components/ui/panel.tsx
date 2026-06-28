import { cn } from "@/lib/utils"

export function Panel({
  children,
  className,
  interactive = false,
}: {
  children: React.ReactNode
  className?: string
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        "group rounded-2xl bg-gradient-to-br from-muted/60 via-muted/40 to-muted/30 p-1 ring-1 ring-border/50 shadow-xs transition-smooth",
        interactive && "hover:ring-border/80 hover:shadow-lg hover:from-muted/70 hover:via-muted/50 hover:to-muted/40 hover:-translate-y-1 cursor-pointer",
        className,
      )}
    >
      <div className="rounded-[calc(var(--radius)+2px)] bg-card h-full p-5 sm:p-6 transition-smooth">
        {children}
      </div>
    </div>
  )
}
