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
    <div className="rounded-md border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
