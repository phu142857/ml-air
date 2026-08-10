"use client"

import { Suspense, useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { History, Download, Search, Loader2 } from "lucide-react"
import { LifecycleTimeline } from "@/components/mlops/lifecycle-timeline"
import { EventDetailPanel } from "@/components/mlops/event-detail-panel"
import { LifecyclePageSkeleton } from "@/components/mlops/audit-timeline-skeleton"
import {
  EventFilters,
  type ActorTypeFilter,
} from "@/components/mlops/event-filters"
import { ErrorBoundary, ErrorDisplay } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLifecycle } from "@/hooks/use-lifecycle"
import { useToast } from "@/hooks/use-toast"
import { exportAuditTimeline } from "@/lib/api"
import { auditEventsToCsv, type AuditEvent } from "@/lib/audit-event"
import { useAppContext } from "@/lib/app-context"
import {
  applyEventFilters,
  type EventExplorerFilters,
  type EventResult,
} from "@/lib/event-explorer"
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages"
import { cn, downloadBlob, formatApiClientError } from "@/lib/utils"

const DEFAULT_FILTERS: Omit<EventExplorerFilters, "searchQuery"> = {
  eventType: "all",
  severity: "all",
  timeRange: "24h",
  actorType: "all",
  targetType: "",
  action: "",
  result: "all",
  actor: "",
  correlationId: "",
  traceId: "",
}

/** Spec breakpoint: stack below 1200px; 60/40 at and above. */
function useSplitLayout() {
  const [split, setSplit] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)")
    const fn = () => setSplit(mq.matches)
    fn()
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])
  return split
}

function LifecycleContent() {
  const { toast } = useToast()
  const { tenantId, projectId, token } = useAppContext()
  const searchParams = useSearchParams()
  const isSplit = useSplitLayout()
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    const trace = (searchParams.get("trace") || "").trim()
    const corr = (searchParams.get("corr") || searchParams.get("correlation") || "").trim()
    if (trace) setSearchQuery(`trace:${trace}`)
    else if (corr) setSearchQuery(`corr:${corr}`)
  }, [searchParams])

  const {
    events,
    stats,
    fetchState,
    isLoading,
    isRefreshing,
    newEventIds,
    refresh,
    scopePinned,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLifecycle()

  const explorerFilters: EventExplorerFilters = useMemo(
    () => ({ ...filters, searchQuery }),
    [filters, searchQuery],
  )

  const filteredEvents = useMemo(
    () => applyEventFilters(Array.isArray(events) ? events : [], explorerFilters),
    [events, explorerFilters],
  )

  const handleSelectEvent = useCallback((event: AuditEvent) => {
    setSelectedEvent(event)
    setDetailOpen(true)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false)
  }, [])

  const handleExport = useCallback(async () => {
    if (!token.trim()) {
      toast({
        variant: "destructive",
        title: "Export unavailable",
        description: "Apply a session token in Settings.",
      })
      return
    }
    setExporting(true)
    try {
      if (filteredEvents.length && !scopePinned) {
        const csv = auditEventsToCsv(filteredEvents)
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mlair-lifecycle.csv")
        toast({ title: "Exported", description: `${filteredEvents.length} rows (current view)` })
        return
      }
      const { blob, filename } = await exportAuditTimeline(tenantId, projectId, token, {
        format: "jsonl",
        limit: 1000,
      })
      downloadBlob(blob, filename)
      toast({
        title: "Export started",
        description: scopePinned ? filename : `${filename} (merged from aggregate scope)`,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: formatApiClientError(e),
      })
    } finally {
      setExporting(false)
    }
  }, [filteredEvents, scopePinned, token, tenantId, projectId, toast])

  const activeFilters =
    [
      filters.eventType !== "all",
      filters.severity !== "all",
      filters.timeRange !== "24h",
      filters.actorType !== "all",
      filters.targetType !== "",
      filters.result !== "all",
      searchQuery !== "",
    ].filter(Boolean).length

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSearchQuery("")
  }

  if (isLoading) {
    return <LifecyclePageSkeleton />
  }

  const isAggregate = !scopePinned

  if (fetchState.status === "error" && fetchState.errorType) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResourcePageHeader className="shrink-0" icon={History} accent="zinc" title="Lifecycle" />
        <div className="min-h-0 flex-1 overflow-auto">
          <ErrorDisplay
            errorType={fetchState.errorType}
            error={fetchState.error}
            onRetry={refresh}
            onGoBack={() => window.history.back()}
            onGoHome={() => (window.location.href = "/")}
          />
        </div>
      </div>
    )
  }

  const statCards = [
    { label: "Total Events", value: stats.total },
    { label: "Success", value: stats.successCount, tone: "text-[color:var(--status-success-fg)]" },
    { label: "Failed", value: stats.failedCount, tone: "text-[color:var(--status-failed-fg)]" },
    { label: "Warnings", value: stats.warningCount, tone: "text-[color:var(--status-pending-fg)]" },
    { label: "Running", value: stats.runningCount, tone: "text-sky-600 dark:text-sky-400" },
  ]

  const showDetail = detailOpen && !!selectedEvent

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Level 1: Header ── */}
      <ResourcePageHeader
        className="shrink-0"
        icon={History}
        accent="zinc"
        title="Lifecycle"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            disabled={exporting || !token.trim()}
            onClick={() => void handleExport()}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export
          </Button>
        }
      />

      {/* ── Level 2: Toolbar (full width, above both columns) ── */}
      <div className="page-toolbar shrink-0 space-y-3">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : null}

        <div
          className={cn(
            "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 transition-opacity duration-300",
            isRefreshing && "opacity-80",
          )}
        >
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", stat.tone ?? "text-foreground")}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search actor, dataset, model, pipeline, run ID, correlation…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 border-border bg-card pl-9 text-sm"
          />
        </div>

        <EventFilters
          eventType={filters.eventType}
          severity={filters.severity}
          timeRange={filters.timeRange}
          actorType={filters.actorType}
          targetType={filters.targetType}
          result={filters.result}
          onEventTypeChange={(v) => setFilters((prev) => ({ ...prev, eventType: v }))}
          onSeverityChange={(v) => setFilters((prev) => ({ ...prev, severity: v }))}
          onTimeRangeChange={(v) => setFilters((prev) => ({ ...prev, timeRange: v }))}
          onActorTypeChange={(v) => setFilters((prev) => ({ ...prev, actorType: v as ActorTypeFilter }))}
          onTargetTypeChange={(v) => setFilters((prev) => ({ ...prev, targetType: v }))}
          onResultChange={(v) => setFilters((prev) => ({ ...prev, result: v as EventResult }))}
          activeFilters={activeFilters}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* ── Level 3: Content — 60/40 grid, independent scrolls ── */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4 overflow-hidden px-4 py-3 sm:px-6 sm:gap-6",
          isSplit
            ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
            : "grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
        )}
      >
        {/* Timeline column */}
        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          {isRefreshing ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-border"
              aria-hidden
            >
              <div className="h-full w-1/3 animate-pulse bg-primary/70" />
            </div>
          ) : null}
          <div className="scroll-region min-h-0 flex-1">
            {filteredEvents.length === 0 ? (
              <MlopsEmptyState icon={History} title="No events" />
            ) : (
              <div className={cn("w-full pb-6", isRefreshing && "opacity-95")}>
                <LifecycleTimeline
                  events={filteredEvents}
                  selectedId={selectedEvent?.id}
                  newEventIds={newEventIds}
                  onSelect={handleSelectEvent}
                />
                {scopePinned && hasNextPage ? (
                  <div className="mt-6 flex justify-center border-t border-border/60 pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage?.()}
                    >
                      {isFetchingNextPage ? "Loading…" : "Load more events"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* Detail column — always in grid below toolbar; sticky within its cell */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card",
              isSplit && "sticky top-0",
            )}
          >
            {showDetail ? (
              <EventDetailPanel
                event={selectedEvent}
                allEvents={filteredEvents}
                open
                onClose={handleCloseDetail}
                onSelect={handleSelectEvent}
                mode="embedded"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">Select an event</p>
                <p className="max-w-[16rem] text-xs text-muted-foreground/80">
                  Event details, actor, and payload appear here.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function LifecyclePage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Loading lifecycle…
          </div>
        }
      >
        <LifecycleContent />
      </Suspense>
    </ErrorBoundary>
  )
}
