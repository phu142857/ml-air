"use client"

import { AlertCircle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface MlopsPageErrorProps {
  message: string
  title?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function MlopsPageError({
  message,
  title = "Something went wrong",
  onRetry,
  retryLabel = "Try again",
  className,
}: MlopsPageErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] px-4 py-3 text-sm text-[color:var(--status-failed-fg)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{title}</p>
            <p className="text-[color:var(--status-failed-fg)]/90">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export interface MlopsPageLoadingProps {
  label?: string
  className?: string
  minHeight?: string
  inline?: boolean
}

export function MlopsPageLoading({
  label = "Loading…",
  className,
  minHeight = "8rem",
  inline = false,
}: MlopsPageLoadingProps) {
  if (inline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed border-border bg-muted/15 px-4 text-sm text-muted-foreground",
        className,
      )}
      style={{ minHeight }}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </div>
    </div>
  )
}
