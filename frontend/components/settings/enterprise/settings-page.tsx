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
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6", className)}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
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
  description?: string
  badge?: React.ReactNode
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  secondaryActions?: React.ReactNode
}) {
  const showHeading = Boolean(title || description || badge || secondaryActions || actions)

  return (
    <header className="space-y-3 border-b border-border pb-6">
      {backHref ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground transition-colors duration-150"
          asChild
        >
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      {showHeading ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {title ? (
                <h1 className="font-heading text-[2rem] font-bold leading-tight tracking-tight text-foreground">
                  {title}
                </h1>
              ) : null}
              {badge}
              {secondaryActions}
            </div>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  )
}
