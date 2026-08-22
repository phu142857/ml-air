import { cn } from "@/lib/utils"

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  headerActions,
  footer,
  bare,
}: {
  id?: string
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  /** Card body only — no section header strip (e.g. avatar card). */
  bare?: boolean
}) {
  const titleId = id && title ? `${id}-title` : undefined
  const showHeader = !bare && Boolean(title || description || headerActions)

  return (
    <section
      id={id}
      className={cn("scroll-mt-6", className)}
      aria-labelledby={titleId}
    >
      {showHeader ? (
        <div className="flex flex-col gap-3 border-b border-border/40 px-0 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
        </div>
      ) : null}
      <div className={cn(bare ? "py-4" : "px-0 py-4")}>{children}</div>
      {footer ? <div className="border-t border-border/40 px-0 py-3">{footer}</div> : null}
    </section>
  )
}
