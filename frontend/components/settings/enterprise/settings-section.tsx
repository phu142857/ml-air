import { cn } from "@/lib/utils"

export function SettingsSection({
  id,
  title,
  children,
  className,
  headerActions,
}: {
  id?: string
  title: string
  children: React.ReactNode
  className?: string
  headerActions?: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-4", className)}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <h2
            id={id ? `${id}-title` : undefined}
            className="text-sm font-semibold text-foreground"
          >
            {title}
          </h2>
          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </section>
  )
}
