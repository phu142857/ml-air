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
} from "lucide-react"
import { AuditTimeline } from "@/components/mlops/audit-timeline"
import { 
  AuditTimelineSkeleton, 
  StatsCardsSkeleton, 
  JaegerSidebarSkeleton,
  LifecyclePageSkeleton 
} from "@/components/mlops/audit-timeline-skeleton"
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
import { useLifecycle } from "@/hooks/use-lifecycle"
import { useToast } from "@/hooks/use-toast"
import { exportAuditTimeline } from "@/lib/api"
import { auditEventsToCsv } from "@/lib/audit-event"
import { useAppContext } from "@/lib/app-context"
import { useJaegerUiUrl } from "@/lib/use-jaeger-ui-url"
import { cn, downloadBlob, formatApiClientError } from "@/lib/utils"

function LifecycleContent() {
  const { toast } = useToast()
  const { tenantId, projectId, token } = useAppContext()
  const searchParams = useSearchParams()
  const runtimeJaegerUrl = useJaegerUiUrl()
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

  // Filter events based on UI state
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
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

  const activeFilters = [
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

  // Show error state
  if (fetchState.status === "error" && fetchState.errorType) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
                <History className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-100">Lifecycle & Audit</h1>
                <p className="text-xs text-zinc-500">Track every event in the ML lifecycle with distributed tracing</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-1">
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
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
              <History className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Lifecycle & Audit</h1>
              <p className="text-xs text-zinc-500">Track every event in the ML lifecycle with distributed tracing</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Live indicator button */}
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "h-8 gap-2 text-xs transition-all",
                isLive 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
              )}
              onClick={toggleLive}
            >
              <span className={cn(
                "flex h-2 w-2 rounded-full",
                isLive ? "bg-emerald-400 animate-breathe-glow" : "bg-zinc-600"
              )} />
              <Radio className="h-3.5 w-3.5" />
              {isLive ? "Live" : "Paused"}
            </Button>
            
            {/* Jaeger Integration Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 text-xs bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 hover:border-sky-500/40">
                  <Zap className="h-3.5 w-3.5" />
                  Jaeger Integration
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle className="text-zinc-100 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
                      <Zap className="h-4 w-4 text-sky-400" />
                    </div>
                    Jaeger Tracing Integration
                  </DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Connect to your Jaeger instance to view distributed traces for ML pipeline executions.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Jaeger UI Base URL
                    </label>
                    <Input
                      value={jaegerUrl}
                      onChange={(e) => setJaegerUrl(e.target.value)}
                      placeholder="http://localhost:16686"
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono text-sm"
                    />
                    <p className="text-[11px] text-zinc-600">
                      The base URL of your Jaeger UI instance. Traces will open at {jaegerUrl}/trace/[traceId]
                    </p>
                  </div>
                  
                  <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Connection Status</span>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        jaegerStatus?.connected
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      )}>
                        {jaegerStatus?.connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    {jaegerStatus?.version && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Jaeger Version</span>
                        <span className="text-sm font-mono text-zinc-400">{jaegerStatus.version}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Events with Traces</span>
                      <span className="text-sm font-medium text-zinc-300">{stats.withTraces} / {stats.total}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Trace Coverage</span>
                      <span className="text-sm font-medium text-sky-400">{stats.tracePercent}%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
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
                            "flex items-center justify-between p-2 rounded-md bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors group",
                            trace.isNew && "animate-highlight-pulse"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {trace.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : trace.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            ) : (
                              <Activity className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                            )}
                            <span className="text-xs text-zinc-300 truncate">{trace.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <code className="text-[10px] font-mono text-zinc-600 group-hover:text-zinc-500">
                              {trace.id.slice(0, 8)}...
                            </code>
                            <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-sky-400" />
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
                    className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
                    onClick={refreshJaeger}
                  >
                    Test Connection
                  </Button>
                  <Button size="sm" className="bg-sky-600 hover:bg-sky-500 text-white">
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
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
              className="h-8 gap-2 text-xs bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
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
              className="h-8 gap-2 text-xs bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
              onClick={refresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="border-b border-zinc-800 bg-zinc-900/20 px-6 py-4">
        {isRefreshing ? (
          <StatsCardsSkeleton />
        ) : (
          <div className="grid grid-cols-5 gap-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Total Events</p>
                    <p className="text-2xl font-semibold text-zinc-100 mt-1">{stats.total}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <Activity className="h-5 w-5 text-violet-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Successful</p>
                    <p className="text-2xl font-semibold text-emerald-400 mt-1">{stats.successCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Failed</p>
                    <p className="text-2xl font-semibold text-red-400 mt-1">{stats.failedCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="h-5 w-5 text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Warnings</p>
                    <p className="text-2xl font-semibold text-amber-400 mt-1">{stats.warningCount}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Trace Coverage</p>
                    <p className="text-2xl font-semibold text-sky-400 mt-1">{stats.tracePercent}%</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <Zap className="h-5 w-5 text-sky-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Filters toolbar */}
      <div className="border-b border-zinc-800 bg-zinc-900/30 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search events, trace IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 bg-zinc-900 border-zinc-800 text-zinc-100 text-sm placeholder:text-zinc-600"
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
          <div className="flex items-center gap-3 text-xs text-zinc-600">
            {isLive && (
              <span className="flex items-center gap-1.5">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-breathe-glow" />
                <span className="text-emerald-400/80">Live</span>
              </span>
            )}
            <span>
              Showing <span className="text-zinc-400 font-medium">{filteredEvents.length}</span> of{" "}
              <span className="text-zinc-500">{events.length}</span> events
            </span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          {/* Timeline content */}
          <div className="flex-1 p-6 overflow-auto">
            {isRefreshing ? (
              <AuditTimelineSkeleton count={6} />
            ) : (
              <AuditTimeline events={filteredEvents} newEventIds={newEventIds} />
            )}
          </div>
          
          {/* Right sidebar - Jaeger quick panel */}
          <div className="w-80 border-l border-zinc-800 bg-zinc-900/20 p-4 overflow-auto">
            {isRefreshing ? (
              <JaegerSidebarSkeleton />
            ) : (
              <div className="space-y-4">
                {/* Jaeger status card */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-sky-400" />
                        Jaeger Tracing
                      </CardTitle>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        jaegerStatus?.connected
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      )}>
                        {jaegerStatus?.connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-zinc-500">
                      Distributed tracing for ML pipelines
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md bg-zinc-950 border border-zinc-800 p-2">
                      <code className="text-[11px] font-mono text-zinc-400 break-all">{jaegerUrl}</code>
                    </div>
                    <Button variant="outline" size="sm" className="w-full h-8 gap-2 text-xs bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20" asChild>
                      <a href={jaegerUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Jaeger UI
                      </a>
                    </Button>
                  </CardContent>
                </Card>
                
                {/* Recent traces */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-zinc-400" />
                      Recent Traces
                    </CardTitle>
                    <CardDescription className="text-xs text-zinc-500">
                      Quick access to recent pipeline traces
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {recentTraces.map((trace) => (
                      <div
                        key={trace.id}
                        className={cn(
                          "rounded-md bg-zinc-950 border border-zinc-800 p-3 space-y-2 transition-all",
                          trace.isNew && "animate-slide-in-highlight"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {trace.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : trace.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            ) : (
                              <Activity className="h-3.5 w-3.5 text-sky-400 shrink-0 animate-pulse" />
                            )}
                            <span className="text-xs text-zinc-300 truncate">{trace.title}</span>
                            {trace.isNew && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-sky-500/10 border-sky-500/30 text-sky-400">
                                New
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <code className="text-[10px] font-mono text-zinc-600">
                            {trace.id.slice(0, 12)}...
                          </code>
                          <JaegerLink traceId={trace.id} variant="link" size="sm" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                {/* Trace stats */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-zinc-400" />
                      Trace Analytics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-xs text-zinc-500">Total Traced Events</span>
                      <span className="text-sm font-medium text-zinc-300">{stats.withTraces}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-xs text-zinc-500">Coverage Rate</span>
                      <span className="text-sm font-medium text-sky-400">{stats.tracePercent}%</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-xs text-zinc-500">Active Runs</span>
                      <span className="text-sm font-medium text-amber-400">{activeRunsCount}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-zinc-500">Failed Traces (24h)</span>
                      <span className="text-sm font-medium text-red-400">{stats.failedCount}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
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
          <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">
            Loading lifecycle…
          </div>
        }
      >
        <LifecycleContent />
      </Suspense>
    </ErrorBoundary>
  )
}
