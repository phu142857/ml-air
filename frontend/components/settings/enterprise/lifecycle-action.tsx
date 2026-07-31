import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LifecycleAction({
  title,
  actionLabel,
  onAction,
  disabled,
  pending,
  variant = "outline",
}: {
  title: string
  actionLabel: string
  onAction: () => void
  disabled?: boolean
  pending?: boolean
  variant?: "outline" | "default"
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <p className="min-w-0 text-sm font-medium text-foreground">{title}</p>
      <Button type="button" size="sm" variant={variant} disabled={disabled || pending} onClick={onAction}>
        {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {actionLabel}
      </Button>
    </div>
  )
}
