export function DangerZone({
  title = "Danger zone",
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-destructive/30 bg-destructive/[0.03]">
      <div className="border-b border-destructive/20 px-3 py-2">
        <h2 className="text-sm font-medium text-destructive">{title}</h2>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  )
}

export function DangerZoneAction({
  title,
  action,
}: {
  title: string
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-destructive/15 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 text-sm font-medium text-foreground">{title}</p>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
