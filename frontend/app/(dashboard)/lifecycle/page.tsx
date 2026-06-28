"use client"

import { Suspense, useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { 
  History, 
  RefreshCw, 
  Download, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  Search,
  TrendingUp,
  Clock,
  Zap,
  Radio,
  Loader2,
  ChevronDown,
  BarChart3,
} from "lucide-react"
import { AuditTimeline } from "@/components/mlops/audit-timeline"
import { LifecyclePageSkeleton } from "@/components/mlops/audit-timeline-skeleton"
import { EventFilters, type EventType, type Severity, type TimeRange } from "@/components/mlops/event-filters"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { ErrorBoundary, ErrorDisplay } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useLifecycle } from "@/hooks/use-lifecycle"
import { useToast } from "@/hooks/use-toast"
import { exportAuditTimeline } from "@/lib/api"
import { auditEventsToCsv } from "@/lib/audit-event"
import { useAppContext } from "@/lib/app-context"
import { useJaegerUiUrl } from "@/lib/use-jaeger-ui-url"
import { useSemanticObservabilitySurfaces, shouldOpenLifecycleMetricsIndex } from "@/lib/use-semantic-observability-surfaces"
import { useGrafanaUiUrl } from "@/lib/use-grafana-ui-url"
import { grafanaDashboardUrl } from "@/lib/grafana-dashboard-url"
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages"
import { cn, downloadBlob, formatApiClientError } from "@/lib/utils"

function LifecycleContent() {
  const { toast } = useToast()
  const { tenantId, projectId, token } = useAppContext()
  const searchParams = useSearchParams()
  const runtimeJaegerUrl = useJaegerUiUrl()
  const semanticObservabilitySurfaces = useSemanticObservabilitySurfaces()
  const grafanaUiUrl = useGrafanaUiUrl()
  const [metricsIndexOpen, setMetricsIndexOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [eventType, setEventType] = useState<EventType>("all")
  const [severity, setSeverity] = useState<Severity>("all")
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const [searchQuery, setSearchQuery] = useState("")
  const [jaegerUrl, setJaegerUrl] = useState("http://localhost:16686")
  useEffect(() => {
    if (runtimeJaegerUrl) setJaegerUrl(runtimeJaegerUrl)
  }, [runtimeJaegerUrl])

  useEffect(() => {
    const trace = (searchParams.get("trace") || "").trim()
    if (trace) setSearchQuery(trace)
  }, [searchParams])

  useEffect(() => {
    if (
      shouldOpenLifecycleMetricsIndex(searchParams.get("metrics")) &&
      semanticObservabilitySurfaces.length > 0
    ) {
      setMetricsIndexOpen(true)
    }
  }, [searchParams, semanticObservabilitySurfaces.length])

  // Data fetching via custom hook
  const {
    events,
    jaegerStatus,
    stats,
    recentTraces,
    activeRunsCount,
    fetchState,
    isLoading,
    isRefreshing,
    isLive,
    newEventIds,
    refresh,
    refreshJaeger,
    toggleLive,
    scopePinned,
    auditFetchJaegerUrl,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLifecycle({ jaegerUrl })

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
          subtitle="Audit trail and tracing"
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
        subtitle={
          isAggregate ? "Audit trail and tracing" : `${stats.total} events in this scope`
        }
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
            
            {/* Jaeger Integration Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary/80 hover:border-primary/40">
                  <Zap className="h-3.5 w-3.5" />
                  Jaeger Integration
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    Jaeger Tracing Integration
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Connect to your Jaeger instance to view distributed traces for ML pipeline executions.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Jaeger UI Base URL
                    </label>
                    <Input
                      value={jaegerUrl}
                      onChange={(e) => setJaegerUrl(e.target.value)}
                      placeholder="http://localhost:16686"
                      className="border-border bg-background font-mono text-sm text-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground/80">
                      The base URL of your Jaeger UI instance. Traces will open at {jaegerUrl}/trace/[traceId]
                    </p>
                  </div>
                  
                  <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Connection Status</span>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        jaegerStatus?.connected
                          ? "bg-[color:var(--status-success-bg)] border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)]"
                          : "bg-[color:var(--status-pending-bg)] border-[color:var(--status-pending-border)] text-[color:var(--status-pending-fg)]"
                      )}>
                        {jaegerStatus?.connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    {jaegerStatus?.version && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Jaeger Version</span>
                        <span className="text-sm font-mono text-muted-foreground">{jaegerStatus.version}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Events with Traces</span>
                      <span className="text-sm font-medium text-foreground/90">{stats.withTraces} / {stats.total}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Trace Coverage</span>
                      <span className="text-sm font-medium text-primary">{stats.tracePercent}%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Quick Access - Recent Traces
                    </label>
                    <div className="space-y-1.5">
                      {recentTraces.map((trace) => (
                        <a
                          key={trace.id}
                          href={`${jaegerUrl}/trace/${trace.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "flex items-center justify-between rounded-md border border-border bg-background p-2 transition-colors hover:border-border hover:bg-muted/40 group",
                            trace.isNew && "animate-highlight-pulse"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {trace.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--status-success-fg)] shrink-0" />
                            ) : trace.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-[color:var(--status-failed-fg)] shrink-0" />
                            ) : (
                              <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                            <span className="text-xs text-foreground/90 truncate">{trace.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <code className="text-[10px] font-mono text-muted-foreground/80 group-hover:text-muted-foreground">
                              {trace.id.slice(0, 8)}...
                            </code>
                            <ExternalLink className="h-3 w-3 text-muted-foreground/80 group-hover:text-primary" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-card border-border text-muted-foreground hover:text-foreground"
                    onClick={refreshJaeger}
                  >
                    Test Connection
                  </Button>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-white">
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
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
        {auditFetchJaegerUrl ? (
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
              <a href={auditFetchJaegerUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                Open last audit fetch in Jaeger
              </a>
            </Button>
          </div>
        ) : null}
        <div
          className={cn(
            "grid grid-cols-5 gap-4 transition-opacity duration-300",
            isRefreshing && "opacity-80",
          )}
        >
            <Card className="panel-surface">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Events</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{stats.total}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-surface">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Successful</p>
                    <p className="mt-1 text-2xl font-semibold text-[color:var(--status-success-fg)]">{stats.successCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)]">
                    <CheckCircle2 className="h-5 w-5 text-[color:var(--status-success-fg)]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-surface">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Failed</p>
                    <p className="mt-1 text-2xl font-semibold text-[color:var(--status-failed-fg)]">{stats.failedCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/20 bg-[color:var(--status-failed-bg)]">
                    <XCircle className="h-5 w-5 text-[color:var(--status-failed-fg)]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-surface">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Warnings</p>
                    <p className="mt-1 text-2xl font-semibold text-[color:var(--status-pending-fg)]">{stats.warningCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)]">
                    <AlertTriangle className="h-5 w-5 text-[color:var(--status-pending-fg)]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-surface">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trace Coverage</p>
                    <p className="mt-1 text-2xl font-semibold text-primary">{stats.tracePercent}%</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
        </div>

        {semanticObservabilitySurfaces.length > 0 ? (
          <Collapsible
            open={metricsIndexOpen}
            onOpenChange={setMetricsIndexOpen}
            className="mt-4 panel-surface"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/40">
              <span className="flex min-w-0 items-center gap-2">
                <BarChart3 className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                <span className="text-sm font-medium text-foreground">Semantic metrics index</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {semanticObservabilitySurfaces.length} surfaces
                </Badge>
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                  From runtime-config → Prometheus / Grafana map
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  metricsIndexOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border px-3 pb-3 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {semanticObservabilitySurfaces.map((surf) => (
                  <div
                    key={surf.id || surf.title}
                    className="rounded-md border border-border bg-background/80 p-3"
                  >
                    <p className="text-xs font-medium text-foreground">{surf.title}</p>
                    {surf.description ? (
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{surf.description}</p>
                    ) : null}
                    {surf.metrics?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {surf.metrics.map((m) => (
                          <code
                            key={m.name}
                            className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            title={[m.kind, ...(m.labels || [])].filter(Boolean).join(" · ")}
                          >
                            {m.name}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    {surf.event_types?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {surf.event_types.map((et) => (
                          <Badge key={et} variant="secondary" className="text-[9px] font-normal">
                            {et}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {surf.grafana_dashboards?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {surf.grafana_dashboards.map((file) => {
                          const href = grafanaDashboardUrl(grafanaUiUrl, file)
                          const label = file.replace(/\.json$/i, "")
                          return href ? (
                            <a
                              key={file}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-primary hover:bg-muted/50"
                            >
                              {label}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span key={file} className="text-[10px] text-muted-foreground/90">
                              Grafana: {file}
                            </span>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
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
            {isRefreshing ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating…
              </span>
            ) : null}
            <span>
              Showing <span className="text-muted-foreground font-medium">{filteredEvents.length}</span> of{" "}
              <span className="text-muted-foreground">{(Array.isArray(events) ? events : []).length}</span> events
            </span>
          </div>
        </div>
      </div>

      {/* Main: timeline + Jaeger sidebar */}
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
              <MlopsEmptyState
                icon={History}
                title="No audit events in this scope"
                description={
                  isAggregate
                    ? "No events match your filters. Clear filters or refresh the stream."
                    : "Adjust filters, refresh, or pick a workspace with recent runs and audit activity."
                }
              />
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
                {/* Jaeger status card */}
                <Card className="panel-surface">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Jaeger Tracing
                      </CardTitle>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        jaegerStatus?.connected
                          ? "bg-[color:var(--status-success-bg)] border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)]"
                          : "bg-[color:var(--status-pending-bg)] border-[color:var(--status-pending-border)] text-[color:var(--status-pending-fg)]"
                      )}>
                        {jaegerStatus?.connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground">
                      Distributed tracing for ML pipelines
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border border-border bg-background p-2">
                      <code className="text-[11px] font-mono text-muted-foreground break-all">{jaegerUrl}</code>
                    </div>
                    <Button variant="outline" size="sm" className="w-full h-8 gap-2 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20" asChild>
                      <a href={jaegerUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Jaeger UI
                      </a>
                    </Button>
                  </CardContent>
                </Card>
                
                {/* Recent traces */}
                <Card className="panel-surface">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Recent Traces
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Quick access to recent pipeline traces
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {recentTraces.map((trace) => (
                      <div
                        key={trace.id}
                        className={cn(
                          "space-y-2 rounded-md border border-border bg-background p-3 transition-all",
                          trace.isNew && "ring-1 ring-primary/25 bg-primary/5"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {trace.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--status-success-fg)] shrink-0" />
                            ) : trace.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-[color:var(--status-failed-fg)] shrink-0" />
                            ) : (
                              <Activity className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
                            )}
                            <span className="text-xs text-foreground/90 truncate">{trace.title}</span>
                            {trace.isNew && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-primary/10 border-primary/30 text-primary">
                                New
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <code className="text-[10px] font-mono text-muted-foreground/80">
                            {trace.id.slice(0, 12)}...
                          </code>
                          <JaegerLink traceId={trace.id} variant="link" size="sm" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                {/* Trace stats */}
                <Card className="panel-surface">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      Trace Analytics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-muted-foreground">Total Traced Events</span>
                      <span className="text-sm font-medium text-foreground/90">{stats.withTraces}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-muted-foreground">Coverage Rate</span>
                      <span className="text-sm font-medium text-primary">{stats.tracePercent}%</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-muted-foreground">Active Runs</span>
                      <span className="text-sm font-medium text-[color:var(--status-pending-fg)]">{activeRunsCount}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-muted-foreground">Failed Traces (24h)</span>
                      <span className="text-sm font-medium text-[color:var(--status-failed-fg)]">{stats.failedCount}</span>
                    </div>
                  </CardContent>
                </Card>
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
