"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ResourceDetailBreadcrumb, MlopsPageError, MlopsPageLoading, type BreadcrumbSegment } from "@/components/mlops/layout"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type SettingsBreadcrumbProps = {
  listHref: string
  listLabel: string
  currentLabel: string
  currentMono?: boolean
  middleSegments?: BreadcrumbSegment[]
}

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
      {loading ? <MlopsPageLoading label="Loading…" inline className="text-sm" /> : null}
      {error ? <MlopsPageError title="Failed to load" message={error} /> : null}
      {children}
    </div>
  )
}

export function SettingsPageHeader({
  title,
  badge,
  breadcrumb,
  backHref,
  backLabel = "Back",
  actions,
  secondaryActions,
}: {
  title?: string
  badge?: React.ReactNode
  breadcrumb?: SettingsBreadcrumbProps
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  secondaryActions?: React.ReactNode
}) {
  const showHeading = Boolean(title || badge || secondaryActions || actions)

  return (
    <header className="space-y-3 border-b border-border pb-6">
      {breadcrumb ? (
        <ResourceDetailBreadcrumb
          {...breadcrumb}
          className="-mx-0 mb-1 rounded-none border-x-0 border-t-0 bg-transparent px-0 py-0"
        />
      ) : backHref ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground transition-colors duration-150 pressable"
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {title ? (
              <h1 className="font-heading text-[2rem] font-bold leading-tight tracking-tight text-foreground">
                {title}
              </h1>
            ) : null}
            {badge}
            {secondaryActions}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  )
}
