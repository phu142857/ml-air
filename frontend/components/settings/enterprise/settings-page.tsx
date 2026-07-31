"use client"

import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function SettingsPage({
  children,
  className,
  loading,
  error,
}: {
  children: React.ReactNode
  className?: string
  loading?: boolean
  error?: string | null
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3", className)}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export function SettingsPageHeader({
  title,
  description,
  badge,
  backHref,
  backLabel = "Back",
  actions,
  secondaryActions,
}: {
  title?: string
  /** Prefer omitting — pages should be self-explanatory from the title. */
  description?: string
  badge?: React.ReactNode
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  secondaryActions?: React.ReactNode
}) {
  const showHeading = Boolean(title || description || badge || secondaryActions || actions)

  return (
    <header className="space-y-2 border-b border-border/60 pb-3">
      {backHref ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground"
          asChild
        >
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      {showHeading ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {title ? (
              <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            ) : null}
            {badge}
            {secondaryActions}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </header>
  )
}
