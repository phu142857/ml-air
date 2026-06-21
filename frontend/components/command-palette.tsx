"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Database,
  GitBranch,
  Play,
  History,
  Box,
  Network,
  Settings,
  LayoutDashboard,
  Search,
  Hash,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ListTodo,
  BarChart3,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { fetchRuns, searchApi, fetchAuditTimeline, type SearchResultItem } from "@/lib/api"
import { mapAuditTimelineItems } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { useJaegerUiUrl } from "@/lib/use-jaeger-ui-url"
import { formatRelativeTime } from "@/lib/utils"
import { normalizeStatus } from "@/lib/status-style"
import { normalizeSearchHref } from "@/lib/search-href"
import { useCanSeeExecutionNav } from "@/lib/hub-nav-access"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const lifecycleNavigation = [
  { name: "Datasets", href: "/datasets", icon: Database, shortcut: "S" },
  { name: "Lifecycle", href: "/lifecycle", icon: History, shortcut: "L" },
  { name: "Models", href: "/models", icon: Box, shortcut: "M" },
  { name: "Lineage", href: "/lineage", icon: Network, shortcut: "G" },
]

const platformNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "D" },
  { name: "Search", href: "/search", icon: Search, shortcut: "/" },
]

const executionNavigation = [
  { name: "Pipelines", href: "/pipelines", icon: GitBranch, shortcut: "P" },
  { name: "Runs", href: "/runs", icon: Play, shortcut: "R" },
  { name: "Tasks", href: "/tasks", icon: ListTodo, shortcut: "T" },
]

const adminNavigation = [
  { name: "Settings", href: "/settings", icon: Settings, shortcut: "," },
]

const quickActions = [
  { name: "Semantic metrics index", href: "/lifecycle?metrics=1", icon: BarChart3, description: "Lifecycle metrics, events, and Grafana dashboards" },
  { name: "Lifecycle timeline", href: "/lifecycle", icon: History, description: "Semantic audit — readiness, train, promote" },
  { name: "Dataset Hub", href: "/datasets", icon: Database, description: "Browse datasets — run / train from a dataset" },
  { name: "Train model", href: "/datasets", icon: Play, description: "Open Dataset Hub to train with a model" },
  { name: "Search page", href: "/search", icon: Search, description: "Full search results" },
]

function isTraceIdFormat(query: string): boolean {
  return /^[a-f0-9]{16,64}$/i.test(query.trim())
}

function runStatusKey(status: string): string {
  const t = normalizeStatus(status)
  if (t === "SUCCESS") return "success"
  if (t === "FAILED") return "failed"
  if (t === "RUNNING") return "running"
  if (t === "QUEUED") return "queued"
  return "pending"
}

function searchItemLabel(it: SearchResultItem): string {
  return it.run_id || it.task_id || it.dataset_id || it.name || "—"
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--status-success-fg)]" />,
  failed: <AlertCircle className="h-3.5 w-3.5 text-[color:var(--status-failed-fg)]" />,
  running: <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />,
  queued: <Clock className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />,
  cancelled: <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  pending: <Clock className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />,
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const jaegerUiUrl = useJaegerUiUrl()
  const { tenantId, projectId, token } = useAppContext()
  const showExecutionNav = useCanSeeExecutionNav()
  const scopePinned = tenantId !== "all" && projectId !== "all"
  const [query, setQuery] = useState("")
  const trimmedQuery = query.trim()
  const searchEnabled = open && Boolean(token?.trim()) && trimmedQuery.length >= 2

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const recentRunsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: open && Boolean(token?.trim()),
    staleTime: 30_000,
  })

  const searchQuery = useQuery({
    queryKey: mlairKeys.search(tenantId, projectId, trimmedQuery, "all"),
    queryFn: () => searchApi(tenantId, projectId, token, trimmedQuery, "all"),
    enabled: searchEnabled,
    staleTime: 10_000,
  })

  const traceMode = trimmedQuery.length >= 2 && isTraceIdFormat(trimmedQuery)
  const auditForTraceQuery = useQuery({
    queryKey: [...mlairKeys.audit.timeline(tenantId, projectId, {}), "trace", trimmedQuery] as const,
    queryFn: async () => {
      const { items } = await fetchAuditTimeline(tenantId, projectId, token, { limit: 50 })
      const events = mapAuditTimelineItems(items)
      const q = trimmedQuery.toLowerCase()
      return events.filter((e) => e.traceId?.toLowerCase().includes(q))
    },
    enabled: open && scopePinned && Boolean(token?.trim()) && traceMode,
  })

  const recentRuns = useMemo(() => {
    const items = recentRunsQuery.data?.items ?? []
    return [...items]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 3)
  }, [recentRunsQuery.data])

  const searchItems = searchQuery.data?.items ?? []
  const traceEvents = auditForTraceQuery.data ?? []

  const handleSelect = (href: string) => {
    router.push(href)
    onOpenChange(false)
  }

  const openFullSearch = () => {
    if (!trimmedQuery) return
    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}&type=all`)
    onOpenChange(false)
  }

  const handleRunSelect = (runId: string) => {
    router.push(`/runs/${encodeURIComponent(runId)}`)
    onOpenChange(false)
  }

  const handleTraceSelect = (traceId: string) => {
    router.push(`/lifecycle?trace=${encodeURIComponent(traceId)}`)
    onOpenChange(false)
  }

  const openJaegerTrace = (traceId: string) => {
    const base = (jaegerUiUrl || "http://localhost:16686").replace(/\/$/, "")
    window.open(`${base}/trace/${encodeURIComponent(traceId)}`, "_blank", "noopener,noreferrer")
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Navigate, search runs, or find traces"
    >
      <CommandInput
        placeholder="Search runs, traces, or type a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <Search className="h-8 w-8 text-muted-foreground/80" />
            <p className="text-sm text-muted-foreground">No results found</p>
            <p className="text-xs text-muted-foreground/80">
              Try a run ID, pipeline name, or trace ID (hex). Aggregate scope searches multiple projects.
            </p>
          </div>
        </CommandEmpty>

        {!scopePinned && trimmedQuery.length >= 2 && traceMode ? (
          <CommandGroup heading="Trace lookup">
            <div className="px-2 py-2 text-xs text-[color:var(--status-pending-fg)]">
              Pin a workspace to load audit rows for this trace. Jaeger links below still work.
            </div>
          </CommandGroup>
        ) : null}

        {searchEnabled && searchQuery.isLoading ? (
          <CommandGroup heading="Searching">
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Querying API…
            </div>
          </CommandGroup>
        ) : null}

        {traceMode && scopePinned ? (
          <>
            {auditForTraceQuery.isLoading ? (
              <CommandGroup heading="Trace">
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading audit events…
                </div>
              </CommandGroup>
            ) : null}
            {traceEvents.length > 0 ? (
              <CommandGroup heading="Lifecycle events (trace)">
                {traceEvents.slice(0, 8).map((event) => (
                  <CommandItem
                    key={event.id}
                    onSelect={() => handleTraceSelect(trimmedQuery)}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                      <History className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm">{event.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{event.description}</span>
                    </div>
                    {statusIcons[event.status]}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Jaeger">
              <CommandItem onSelect={() => openJaegerTrace(trimmedQuery)} className="flex items-center gap-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)]">
                  <ExternalLink className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">Open trace in Jaeger</span>
                  <span className="font-mono text-xs text-muted-foreground">{trimmedQuery.slice(0, 24)}…</span>
                </div>
                <Badge variant="outline" className="h-5 border-[color:var(--status-pending-border)] text-[10px] text-[color:var(--status-pending-fg)]">
                  External
                </Badge>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}

        {searchEnabled && !traceMode && trimmedQuery.length >= 2 ? (
          <CommandGroup heading="Search page">
            <CommandItem onSelect={openFullSearch} className="flex items-center gap-3 py-2">
              <Search className="h-4 w-4 text-primary" />
              <span className="text-sm">Open full search for “{trimmedQuery}”</span>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/80" />
            </CommandItem>
          </CommandGroup>
        ) : null}

        {searchEnabled && !traceMode && searchItems.length > 0 ? (
          <CommandGroup heading="Search results">
            {searchItems.map((it, i) => (
              <CommandItem
                key={`${it.type}-${searchItemLabel(it)}-${i}`}
                onSelect={() => handleSelect(normalizeSearchHref(it))}
                className="flex items-center gap-3 py-2"
              >
                {it.type === "run" ? (
                  <Play className="h-4 w-4 text-primary" />
                ) : it.type === "dataset" ? (
                  <Database className="h-4 w-4 text-[color:var(--status-success-fg)]" />
                ) : (
                  <GitBranch className="h-4 w-4 text-[color:var(--status-pending-fg)]" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{searchItemLabel(it)}</span>
                    {it.status ? statusIcons[runStatusKey(it.status)] : null}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    [{it.type}]
                    {it.scope_tenant_id ? ` · ${it.scope_tenant_id}/${it.scope_project_id}` : ""}
                    {it.pipeline_id ? ` · ${it.pipeline_id}` : ""}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/80" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {trimmedQuery.length >= 2 && scopePinned && !traceMode && !searchQuery.isLoading && searchItems.length === 0 ? (
          <CommandGroup heading="API search">
            <div className="px-2 py-2 text-xs text-muted-foreground">No matches from search API for this query.</div>
          </CommandGroup>
        ) : null}

        {!trimmedQuery ? (
          <>
            <CommandGroup heading="Lifecycle">
              {lifecycleNavigation.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-center gap-3"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.name}</span>
                  <CommandShortcut className="ml-auto">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Overview">
              {platformNavigation.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-center gap-3"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.name}</span>
                  <CommandShortcut className="ml-auto">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            {showExecutionNav ? (
              <CommandGroup heading="Execution (maintainer)">
                {executionNavigation.map((item) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-3"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.name}</span>
                    <CommandShortcut className="ml-auto">
                      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                        {item.shortcut}
                      </kbd>
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            <CommandGroup heading="Admin">
              {adminNavigation.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-center gap-3"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.name}</span>
                  <CommandShortcut className="ml-auto">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Quick Actions">
              {quickActions.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[color:var(--status-pending-bg)]">
                    <item.icon className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />
                  </div>
                  <div className="flex flex-col">
                    <span>{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            {showExecutionNav ? (
              <>
                <CommandSeparator />

                <CommandGroup heading="Recent Runs">
                  {recentRunsQuery.isLoading ? (
                    <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </div>
                  ) : null}
                  {recentRuns.map((run) => (
                    <CommandItem
                      key={run.run_id}
                      onSelect={() => handleRunSelect(run.run_id)}
                      className="flex items-center gap-3"
                    >
                      {statusIcons[runStatusKey(run.status)]}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-mono">{run.pipeline_id}</span>
                        <span className="text-xs text-muted-foreground">{run.run_id}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/80">
                        {formatRelativeTime(run.updated_at || run.created_at)}
                      </span>
                    </CommandItem>
                  ))}
                  {!recentRunsQuery.isLoading && recentRuns.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">No runs in this scope.</div>
                  ) : null}
                </CommandGroup>
              </>
            ) : null}

            <CommandSeparator />

            <CommandGroup heading="Search Tips">
              <div className="space-y-1.5 px-2 py-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <span>
                    Paste a <span className="font-mono text-primary">trace ID</span> (hex) for Jaeger + audit
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 text-primary" />
                  <span>
                    Type <span className="font-mono text-primary">2+ characters</span> to search runs, tasks, datasets
                  </span>
                </div>
              </div>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
