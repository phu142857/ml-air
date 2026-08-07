"use client"

import { Suspense, useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { 
  History, 
  RefreshCw, 
  Download, 
  Activity, 
  CheckCircle2, 
  XCircle,
  Search,
  Radio,
  Loader2,
} from "lucide-react"
import { AuditTimeline } from "@/components/mlops/audit-timeline"
import { LifecyclePageSkeleton } from "@/components/mlops/audit-timeline-skeleton"
import { EventFilters, type EventType, type Severity, type TimeRange } from "@/components/mlops/event-filters"
import { TraceLink } from "@/components/mlops/trace-link"
import { ErrorBoundary, ErrorDisplay } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useLifecycle } from "@/hooks/use-lifecycle"
import { useToast } from "@/hooks/use-toast"
import { exportAuditTimeline } from "@/lib/api"
import { auditEventsToCsv } from "@/lib/audit-event"
import { useAppContext } from "@/lib/app-context"
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages"
import { cn, downloadBlob, formatApiClientError } from "@/lib/utils"

function LifecycleContent() {
  const { toast } = useToast()
  const { tenantId, projectId, token } = useAppContext()
  const searchParams = useSearchParams()
  const [exporting, setExporting] = useState(false)

  const [eventType, setEventType] = useState<EventType>("all")
  const [severity, setSeverity] = useState<Severity>("all")
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const trace = (searchParams.get("trace") || "").trim()
    if (trace) {
      setSearchQuery(trace)
    }
  }, [searchParams])

  // Data fetching via custom hook
  const {
    events,
    stats,
    recentTraces,
    activeRunsCount,
    fetchState,
    isLoading,
    isRefreshing,
    isLive,
    newEventIds,
    refresh,
    toggleLive,
    scopePinned,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLifecycle()

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
  }, [scopePinned, token, tenantId, projectId, toast])

  // Filter events based on UI state (defensive: timeline data must be an array)
  const filteredEvents = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    return list.filter((event) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = event.title.toLowerCase().includes(query)
        const matchesDescription = event.description.toLowerCase().includes(query)
        const matchesTraceId = event.traceId?.toLowerCase().includes(query)
        if (!matchesTitle && !matchesDescription && !matchesTraceId) {
          return false
        }
      }
      
      if (eventType !== "all" && event.eventType !== eventType) {
        return false
      }
      
      if (severity !== "all" && event.severity !== severity) {
        return false
      }
      
      if (timeRange !== "all") {
        const eventDate = new Date(event.timestamp)
        const now = new Date()
        const diffMs = now.getTime() - eventDate.getTime()
        const diffHours = diffMs / (1000 * 60 * 60)
        
        const rangeHours: Record<TimeRange, number> = {
          "1h": 1,
          "24h": 24,
          "7d": 24 * 7,
          "30d": 24 * 30,
          "all": Infinity,
        }
        
        if (diffHours > rangeHours[timeRange]) {
          return false
        }
      }
      
      return true
    })
  }, [eventType, severity, timeRange, searchQuery, events])

  const handleExportView = useCallback(() => {
    if (!filteredEvents.length) {
      toast({ variant: "destructive", title: "Nothing to export", description: "Adjust filters or refresh the timeline." })
      return
    }
    const csv = auditEventsToCsv(filteredEvents)
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mlair-audit-filtered.csv")
    toast({ title: "Exported", description: `${filteredEvents.length} rows (current view)` })
  }, [filteredEvents, toast])

  const activeFilters =
    [
      eventType !== "all",
      severity !== "all",
      timeRange !== "24h",
      searchQuery !== "",
    ].filter(Boolean).length

  const handleClearFilters = () => {
    setEventType("all")
    setSeverity("all")
    setTimeRange("24h")
    setSearchQuery("")
  }

  // Show full page skeleton on initial load
  if (isLoading) {
    return <LifecyclePageSkeleton />
  }

  const isAggregate = !scopePinned

  // Show error state
  if (fetchState.status === "error" && fetchState.errorType) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResourcePageHeader
          className="shrink-0"
          icon={History}
          accent="violet"
          title="Lifecycle & Audit"
        />
        
        <div className="min-h-0 flex-1 overflow-auto">
          <ErrorDisplay
            errorType={fetchState.errorType}
            error={fetchState.error}
            onRetry={refresh}
            onGoBack={() => window.history.back()}
            onGoHome={() => window.location.href = "/"}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={History}
        accent="violet"
        title="Lifecycle & Audit"
        actions={
          <>
            {/* Live indicator button */}
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-2 text-xs transition-all",
                isLive
                  ? "bg-[color:var(--status-success-bg)] border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)] hover:bg-[color:var(--status-success-bg)] hover:text-[color:var(--status-success-fg)] hover:border-[color:var(--status-success-border)]"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
              onClick={toggleLive}
            >
              <span className={cn(
                "flex h-2 w-2 rounded-full",
                isLive ? "bg-primary animate-breathe-glow" : "bg-muted-foreground/50"
              )} />
              <Radio className="h-3.5 w-3.5" />
              {isLive ? "Live" : "Paused"}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs bg-card border-border text-muted-foreground hover:text-foreground"
              disabled={exporting || !token.trim()}
              title={
                !scopePinned
                  ? "Merges NDJSON exports from up to 12 tenant/project pairs"
                  : undefined
              }
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export API
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs bg-card border-border text-muted-foreground hover:text-foreground"
              disabled={!filteredEvents.length}
              title="Download filtered rows as CSV (client-side)"
              onClick={handleExportView}
            >
              <Download className="h-3.5 w-3.5" />
              View CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs bg-card border-border text-muted-foreground hover:text-foreground"
              onClick={refresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      {/* Stats cards */}
      <div className="shrink-0 page-toolbar">
        {isAggregate ? (
          <div className="mb-4">
            <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} />
          </div>
        ) : null}
        <div
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-5 transition-opacity duration-300",
            isRefreshing && "opacity-80",
          )}
        >
            {[
              { label: "Events", value: stats.total, className: "text-foreground" },
              { label: "Success", value: stats.successCount, className: "text-[color:var(--status-success-fg)]" },
              { label: "Failed", value: stats.failedCount, className: "text-[color:var(--status-failed-fg)]" },
              { label: "Warnings", value: stats.warningCount, className: "text-[color:var(--status-pending-fg)]" },
              { label: "Trace %", value: `${stats.tracePercent}%`, className: "text-primary" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", stat.className)}>{stat.value}</p>
              </div>
            ))}
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="shrink-0 page-toolbar space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search events, trace IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 border-border bg-card pl-9 text-sm text-foreground placeholder:text-muted-foreground/80"
              />
            </div>
            <EventFilters
              eventType={eventType}
              severity={severity}
              timeRange={timeRange}
              onEventTypeChange={setEventType}
              onSeverityChange={setSeverity}
              onTimeRangeChange={setTimeRange}
              activeFilters={activeFilters}
              onClearFilters={handleClearFilters}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground/80">
            <span>
              Showing <span className="text-muted-foreground font-medium">{filteredEvents.length}</span> of{" "}
              <span className="text-muted-foreground">{(Array.isArray(events) ? events : []).length}</span> events
            </span>
          </div>
        </div>
      </div>

      {/* Main: timeline + trace sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-6">
            {isRefreshing ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-border"
                aria-hidden
              >
                <div className="h-full w-1/3 animate-pulse bg-primary/70" />
              </div>
            ) : null}
            {filteredEvents.length === 0 ? (
              <MlopsEmptyState icon={History} title="No events" />
            ) : (
              <div
                className={cn(
                  "transition-opacity duration-300",
                  isRefreshing && "opacity-95",
                )}
              >
                <AuditTimeline events={filteredEvents} newEventIds={newEventIds} />
                {scopePinned && hasNextPage ? (
                  <div className="mt-6 flex justify-center border-t border-border/60 pt-4">
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

          <div
            className={cn(
              "min-h-0 w-80 shrink-0 self-stretch overflow-y-auto border-l border-border surface-muted p-4 transition-opacity duration-300",
              isRefreshing && "opacity-90",
            )}
          >
              <div className="space-y-4">
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Recent traces
                  </h3>
                  <div className="space-y-2">
                    {recentTraces.map((trace) => (
                      <div
                        key={trace.id}
                        className={cn(
                          "space-y-2 rounded-md border border-border bg-background p-2.5",
                          trace.isNew && "ring-1 ring-primary/25 bg-primary/5"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {trace.status === "success" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-success-fg)]" />
                          ) : trace.status === "failed" ? (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-failed-fg)]" />
                          ) : (
                            <Activity className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                          )}
                          <span className="truncate text-xs text-foreground/90">{trace.title}</span>
                          {trace.isNew ? (
                            <Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
                              New
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between">
                          <code className="font-mono text-[10px] text-muted-foreground/80">
                            {trace.id.slice(0, 12)}...
                          </code>
                          <TraceLink traceId={trace.id} variant="link" size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Trace analytics
                  </h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between border-b border-border py-1.5">
                      <span className="text-muted-foreground">Traced events</span>
                      <span className="font-medium tabular-nums text-foreground/90">{stats.withTraces}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border py-1.5">
                      <span className="text-muted-foreground">Coverage</span>
                      <span className="font-medium tabular-nums text-primary">{stats.tracePercent}%</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border py-1.5">
                      <span className="text-muted-foreground">Active runs</span>
                      <span className="font-medium tabular-nums text-[color:var(--status-pending-fg)]">{activeRunsCount}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-muted-foreground">Failed (24h)</span>
                      <span className="font-medium tabular-nums text-[color:var(--status-failed-fg)]">{stats.failedCount}</span>
                    </div>
                  </div>
                </section>
              </div>
          </div>
        </div>
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
