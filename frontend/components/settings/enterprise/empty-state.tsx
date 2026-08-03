import { Button } from "@/components/ui/button"

export function SettingsEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 px-6 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" className="mt-4 h-8 transition-colors duration-150" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
