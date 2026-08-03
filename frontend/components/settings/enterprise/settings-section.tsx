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
      <div className="rounded-md border border-border bg-card">
        {showHeader ? (
          <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
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
        <div className={cn(bare ? "p-6" : "px-6 py-6")}>{children}</div>
        {footer ? <div className="border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </section>
  )
}
