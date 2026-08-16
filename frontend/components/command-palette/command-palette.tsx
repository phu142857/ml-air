"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Hash,
  History,
  Loader2,
  Play,
  Database,
  GitBranch,
  AlertCircle,
} from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  fetchAuditTimelinePage,
  fetchPipelines,
  fetchPipelinesPage,
  fetchRuns,
  fetchRunsPage,
  fetchTraceList,
  searchApi,
  searchApiPage,
  type SearchResultItem,
} from "@/lib/api"
import { mapAuditTimelineItems } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { useTraceSearch } from "@/hooks/use-trace-detail"
import { useAppContext } from "@/lib/app-context"
import { TraceExplorerDialog } from "@/components/mlops/trace-link"
import { formatRelativeTime } from "@/lib/utils"
import { computeTraceSearchDurationMs } from "@/lib/trace-duration"
import { formatDurationMs } from "@/lib/usage-format"
import { normalizeStatus } from "@/lib/status-style"
import { normalizeSearchHref } from "@/lib/search-href"
import { useCanSeeExecutionNav } from "@/lib/hub-nav-access"
import { isTraceIdFormat } from "@/lib/trace-id"
import { usePaletteContextCommands } from "@/hooks/use-palette-context-commands"
import { fuzzyFilter } from "@/lib/command-palette/fuzzy"
import {
  loadPinnedCommandIds,
  loadRecentItems,
  pushRecentItem,
  togglePinnedCommandId,
} from "@/lib/command-palette/storage"
import { visiblePaletteCommands } from "@/lib/command-palette/registry"
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type CommandPaletteSection,
  type PaletteListEntry,
  type RecentPaletteItem,
} from "@/lib/command-palette/types"
import { CommandPaletteDialog } from "./command-palette-dialog"
import { CommandPaletteFooter } from "./command-palette-footer"
import {
  CommandPaletteEmpty,
  CommandPaletteItem,
  CommandPaletteLoading,
} from "./command-palette-item"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  queued: <Clock className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />,
  cancelled: <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  pending: <Clock className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />,
}

function searchResultIcon(type: SearchResultItem["type"]) {
  if (type === "run") return Play
  if (type === "dataset") return Database
  return GitBranch
}

function groupEntries(entries: PaletteListEntry[]): Array<[CommandPaletteSection, PaletteListEntry[]]> {
  const map = new Map<CommandPaletteSection, PaletteListEntry[]>()
  for (const entry of entries) {
    const bucket = map.get(entry.section) ?? []
    bucket.push(entry)
    map.set(entry.section, bucket)
  }
  return SECTION_ORDER.filter((section) => map.has(section)).map((section) => [
    section,
    map.get(section)!,
  ])
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const { setTheme, resolvedTheme } = useTheme()
  const showExecutionNav = useCanSeeExecutionNav()
  const scopePinned = tenantId !== "all" && projectId !== "all"

  const [query, setQuery] = useState("")
  const [traceDialogId, setTraceDialogId] = useState<string | null>(null)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [recentItems, setRecentItems] = useState<RecentPaletteItem[]>([])

  const trimmedQuery = query.trim()
  const searchEnabled = open && Boolean(token?.trim()) && trimmedQuery.length >= 2
  const traceMode = trimmedQuery.length >= 2 && isTraceIdFormat(trimmedQuery)

  useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
    setPinnedIds(loadPinnedCommandIds())
    setRecentItems(loadRecentItems())
  }, [open])

  const recentRunsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: async () => {
      if (scopePinned) {
        const page = await fetchRunsPage(tenantId, projectId, token, { limit: 20 })
        return { items: page.items }
      }
      return fetchRuns(tenantId, projectId, token)
    },
    enabled: open && Boolean(token?.trim()),
    staleTime: 30_000,
  })

  const recentTracesQuery = useQuery({
    queryKey: mlairKeys.trace.list(tenantId, projectId, 0),
    queryFn: () => fetchTraceList(tenantId, projectId, token, { limit: 8 }),
    enabled: open && scopePinned && Boolean(token?.trim()),
    staleTime: 15_000,
  })

  const recentPipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: async () => {
      if (scopePinned) {
        const page = await fetchPipelinesPage(tenantId, projectId, token, { limit: 20 })
        return { items: page.items }
      }
      return fetchPipelines(tenantId, projectId, token)
    },
    enabled: open && Boolean(token?.trim()) && showExecutionNav,
    staleTime: 30_000,
  })

  const searchQuery = useQuery({
    queryKey: mlairKeys.search(tenantId, projectId, trimmedQuery, "all"),
    queryFn: async () => {
      if (scopePinned) {
        const page = await searchApiPage(tenantId, projectId, token, trimmedQuery, "all", { limit: 20 })
        return { q: page.q, items: page.items, aggregate: false as const }
      }
      return searchApi(tenantId, projectId, token, trimmedQuery, "all")
    },
    enabled: searchEnabled && !traceMode,
    staleTime: 10_000,
  })

  const auditForTraceQuery = useQuery({
    queryKey: [...mlairKeys.audit.timeline(tenantId, projectId, {}), "trace", trimmedQuery] as const,
    queryFn: async () => {
      const page = await fetchAuditTimelinePage(tenantId, projectId, token, { limit: 100 })
      const events = mapAuditTimelineItems(page.items)
      const q = trimmedQuery.toLowerCase()
      return events.filter((e) => e.traceId?.toLowerCase().includes(q))
    },
    enabled: open && scopePinned && Boolean(token?.trim()) && traceMode,
  })

  const traceSearchQuery = useTraceSearch(
    tenantId,
    projectId,
    token,
    trimmedQuery,
    open && scopePinned && traceMode && trimmedQuery.length >= 4,
  )

  const closePalette = useCallback(() => onOpenChange(false), [onOpenChange])

  const rememberRecent = useCallback((item: Omit<RecentPaletteItem, "visitedAt">) => {
    setRecentItems(pushRecentItem(item))
  }, [])

  const navigate = useCallback(
    (href: string, recent?: Omit<RecentPaletteItem, "visitedAt">) => {
      if (recent) rememberRecent(recent)
      router.push(href)
      closePalette()
    },
    [router, closePalette, rememberRecent],
  )

  const openTrace = useCallback(
    (traceId: string, label?: string) => {
      rememberRecent({
        id: `trace:${traceId}`,
        kind: "trace",
        label: label ?? traceId.slice(0, 20),
        sublabel: traceId,
        traceId,
      })
      setTraceDialogId(traceId)
      closePalette()
    },
    [closePalette, rememberRecent],
  )

  const contextEntries = usePaletteContextCommands({ closePalette, openTrace })

  const handlePinToggle = useCallback((commandId: string) => {
    setPinnedIds(togglePinnedCommandId(commandId))
  }, [])

  const commandDefs = useMemo(
    () => visiblePaletteCommands({ showExecutionNav }),
    [showExecutionNav],
  )

  const staticEntries = useMemo(() => {
    const ctx = { setTheme, resolvedTheme }
    return commandDefs.map<PaletteListEntry>((cmd) => ({
      id: cmd.id,
      section: cmd.section,
      label: cmd.label,
      sublabel: cmd.description,
      keywords: [cmd.label, cmd.description ?? "", ...(cmd.keywords ?? []), cmd.shortcut ?? ""]
        .filter(Boolean)
        .join(" "),
      icon: cmd.icon,
      shortcut: cmd.shortcut,
      pinnable: cmd.pinnable,
      pinned: pinnedIds.includes(cmd.id),
      onSelect: () => {
        if (cmd.run) {
          cmd.run(ctx)
          rememberRecent({
            id: `command:${cmd.id}`,
            kind: "command",
            commandId: cmd.id,
            label: cmd.label,
            sublabel: cmd.description,
          })
          if (!cmd.href) {
            closePalette()
            return
          }
        }
        if (cmd.href) {
          navigate(cmd.href, {
            id: `command:${cmd.id}`,
            kind: "command",
            commandId: cmd.id,
            label: cmd.label,
            sublabel: cmd.description,
            href: cmd.href,
          })
        }
      },
      onPinToggle: cmd.pinnable ? () => handlePinToggle(cmd.id) : undefined,
    }))
  }, [commandDefs, pinnedIds, setTheme, resolvedTheme, navigate, rememberRecent, closePalette, handlePinToggle])

  const pinnedEntries = useMemo(() => {
    const byId = new Map(staticEntries.map((entry) => [entry.id, entry]))
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is PaletteListEntry => Boolean(entry))
      .map((entry) => ({ ...entry, section: "pinned" as const }))
  }, [staticEntries, pinnedIds])

  const recentEntries = useMemo(() => {
    const byCommandId = new Map(staticEntries.map((entry) => [entry.id, entry]))
    return recentItems
      .map<PaletteListEntry | null>((item) => {
        if (item.kind === "command" && item.commandId) {
          const cmd = byCommandId.get(item.commandId)
          if (cmd) {
            return {
              ...cmd,
              section: "recent",
              sublabel: item.sublabel ?? cmd.sublabel,
            }
          }
        }
        const icon =
          item.kind === "run" ? Play : item.kind === "pipeline" ? GitBranch : item.kind === "trace" ? Hash : History
        return {
          id: `recent:${item.id}`,
          section: "recent",
          label: item.label,
          sublabel: item.sublabel,
          keywords: [item.label, item.sublabel ?? ""].join(" "),
          icon,
          onSelect: () => {
            if (item.traceId) {
              openTrace(item.traceId, item.label)
              return
            }
            if (item.href) {
              navigate(item.href, item)
              return
            }
          },
        }
      })
      .filter((entry): entry is PaletteListEntry => Boolean(entry))
  }, [recentItems, staticEntries, navigate, openTrace])

  const resourceEntries = useMemo(() => {
    const entries: PaletteListEntry[] = []

    const runs = [...(recentRunsQuery.data?.items ?? [])]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 5)
    for (const run of runs) {
      entries.push({
        id: `resource-run:${run.run_id}`,
        section: "resources",
        label: run.pipeline_id || run.run_id,
        sublabel: run.run_id,
        keywords: [run.run_id, run.pipeline_id, "run"].join(" "),
        icon: Play,
        trailing: (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(run.updated_at || run.created_at)}
          </span>
        ),
        onSelect: () =>
          navigate(`/runs/${encodeURIComponent(run.run_id)}`, {
            id: `run:${run.run_id}`,
            kind: "run",
            label: run.pipeline_id || run.run_id,
            sublabel: run.run_id,
            href: `/runs/${encodeURIComponent(run.run_id)}`,
          }),
      })
    }

    const traces = recentTracesQuery.data?.items ?? []
    for (const trace of traces.slice(0, 5)) {
      entries.push({
        id: `resource-trace:${trace.trace_id}`,
        section: "resources",
        label: trace.root_name?.trim() || trace.pipeline_id?.trim() || trace.trace_id.slice(0, 18),
        sublabel: trace.trace_id,
        keywords: [trace.trace_id, trace.root_name ?? "", trace.pipeline_id ?? "", "trace"].join(" "),
        icon: Hash,
        onSelect: () => openTrace(trace.trace_id, trace.root_name ?? trace.trace_id.slice(0, 18)),
      })
    }

    const pipelines = [...(recentPipelinesQuery.data?.items ?? [])]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 5)
    for (const pipeline of pipelines) {
      entries.push({
        id: `resource-pipeline:${pipeline.pipeline_id}`,
        section: "resources",
        label: pipeline.pipeline_id,
        sublabel: `${pipeline.latest_status || "—"} · ${pipeline.total_runs} runs`,
        keywords: [pipeline.pipeline_id, pipeline.latest_status ?? "", "pipeline"].join(" "),
        icon: GitBranch,
        onSelect: () =>
          navigate(`/pipelines/${encodeURIComponent(pipeline.pipeline_id)}`, {
            id: `pipeline:${pipeline.pipeline_id}`,
            kind: "pipeline",
            label: pipeline.pipeline_id,
            sublabel: pipeline.latest_status,
            href: `/pipelines/${encodeURIComponent(pipeline.pipeline_id)}`,
          }),
      })
    }

    return entries
  }, [
    recentRunsQuery.data,
    recentTracesQuery.data,
    recentPipelinesQuery.data,
    navigate,
    openTrace,
  ])

  const searchEntries = useMemo(() => {
    if (!searchEnabled || traceMode) return [] as PaletteListEntry[]
    const entries: PaletteListEntry[] = [
      {
        id: "search-full",
        section: "search",
        label: `Search for “${trimmedQuery}”`,
        sublabel: "Open full search results page",
        keywords: trimmedQuery,
        icon: ArrowRight,
        onSelect: () => {
          router.push(`/search?q=${encodeURIComponent(trimmedQuery)}&type=all`)
          closePalette()
        },
      },
    ]

    for (const [index, item] of (searchQuery.data?.items ?? []).entries()) {
      const Icon = searchResultIcon(item.type)
      entries.push({
        id: `search-api:${item.type}:${searchItemLabel(item)}:${index}`,
        section: "search",
        label: searchItemLabel(item),
        sublabel: `[${item.type}]${item.pipeline_id ? ` · ${item.pipeline_id}` : ""}`,
        keywords: [searchItemLabel(item), item.type, item.pipeline_id ?? ""].join(" "),
        icon: Icon,
        trailing: item.status ? statusIcons[runStatusKey(item.status)] : null,
        onSelect: () => navigate(normalizeSearchHref(item)),
      })
    }

    return entries
  }, [searchEnabled, traceMode, trimmedQuery, searchQuery.data, router, closePalette, navigate])

  const traceEntries = useMemo(() => {
    if (!traceMode) return [] as PaletteListEntry[]
    const entries: PaletteListEntry[] = [
      {
        id: `trace-open:${trimmedQuery}`,
        section: "search",
        label: "Open trace explorer",
        sublabel: trimmedQuery,
        keywords: trimmedQuery,
        icon: Hash,
        onSelect: () => openTrace(trimmedQuery),
      },
    ]

    for (const event of auditForTraceQuery.data ?? []) {
      entries.push({
        id: `trace-event:${event.id}`,
        section: "search",
        label: event.title,
        sublabel: event.description,
        keywords: [event.title, event.description ?? "", trimmedQuery].join(" "),
        icon: History,
        trailing: statusIcons[event.status],
        onSelect: () => openTrace(trimmedQuery, event.title),
      })
    }

    for (const hit of traceSearchQuery.data?.items ?? []) {
      const traceDuration = formatDurationMs(computeTraceSearchDurationMs(hit))
      entries.push({
        id: `trace-hit:${hit.trace_id}`,
        section: "search",
        label: hit.trace_id.slice(0, 24),
        sublabel: `${hit.root_service || hit.source}${traceDuration !== "—" ? ` · ${traceDuration}` : ""}`,
        keywords: [hit.trace_id, hit.root_service ?? "", hit.source ?? ""].join(" "),
        icon: Hash,
        onSelect: () => openTrace(hit.trace_id),
      })
    }

    return entries
  }, [traceMode, trimmedQuery, auditForTraceQuery.data, traceSearchQuery.data, openTrace])

  const idleEntries = useMemo(() => {
    const navigation = staticEntries.filter((entry) => entry.section === "navigation")
    const actions = staticEntries.filter((entry) => entry.section === "actions")
    const appearance = staticEntries.filter((entry) => entry.section === "appearance")
    return [
      ...pinnedEntries,
      ...recentEntries,
      ...contextEntries,
      ...navigation,
      ...actions,
      ...resourceEntries,
      ...appearance,
    ]
  }, [staticEntries, pinnedEntries, recentEntries, contextEntries, resourceEntries])

  const filteredEntries = useMemo(() => {
    if (!trimmedQuery) return idleEntries
    if (traceMode) return traceEntries
    const local = fuzzyFilter(trimmedQuery, idleEntries, (entry) => entry.keywords)
    return [...local, ...searchEntries]
  }, [trimmedQuery, idleEntries, traceMode, traceEntries, searchEntries])

  const grouped = useMemo(() => groupEntries(filteredEntries), [filteredEntries])

  const scopeLabel =
    tenantId === "all" || projectId === "all"
      ? "Aggregate scope"
      : `${tenantId}/${projectId}`

  const isLoadingSearch = searchEnabled && !traceMode && searchQuery.isLoading
  const showEmpty =
    trimmedQuery.length > 0 &&
    !isLoadingSearch &&
    !auditForTraceQuery.isLoading &&
    !traceSearchQuery.isLoading &&
    filteredEntries.length === 0

  return (
    <>
      <CommandPaletteDialog open={open} onOpenChange={onOpenChange}>
        <Command
          shouldFilter={false}
          className="command-palette-command flex h-full w-full flex-col overflow-hidden bg-transparent"
        >
          <CommandInput
            placeholder="Search commands, runs, traces, pipelines…"
            value={query}
            onValueChange={setQuery}
            className="h-12 border-none px-0 text-[15px] placeholder:text-muted-foreground/80"
          />
          <CommandList className="max-h-[min(26rem,52vh)] scroll-py-1 overflow-x-hidden overflow-y-auto px-1 pb-1">
            {!scopePinned && traceMode ? (
              <CommandGroup heading={SECTION_LABELS.search}>
                <CommandPaletteLoading label="Pin a workspace to load trace audit rows for this ID." />
              </CommandGroup>
            ) : null}

            {isLoadingSearch ? (
              <CommandGroup heading={SECTION_LABELS.search}>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching API…
                </div>
              </CommandGroup>
            ) : null}

            {traceMode && scopePinned && auditForTraceQuery.isLoading ? (
              <CommandGroup heading={SECTION_LABELS.search}>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading trace context…
                </div>
              </CommandGroup>
            ) : null}

            {traceMode && scopePinned && traceSearchQuery.isLoading ? (
              <CommandGroup heading={SECTION_LABELS.search}>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching traces…
                </div>
              </CommandGroup>
            ) : null}

            {grouped.map(([section, entries]) => (
              <CommandGroup
                key={section}
                heading={SECTION_LABELS[section]}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground/90"
              >
                {entries.map((entry) => (
                  <CommandItem
                    key={entry.id}
                    value={entry.id}
                    onSelect={entry.onSelect}
                    className="group mb-0.5 interactive-row pressable flex items-center gap-3 rounded-md px-2 py-2.5 aria-selected:bg-accent/70 data-[selected=true]:shadow-sm"
                  >
                    <CommandPaletteItem entry={entry} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {showEmpty ? (
              <CommandEmpty>
                <CommandPaletteEmpty query={query} />
              </CommandEmpty>
            ) : null}
          </CommandList>
          <CommandPaletteFooter scopeLabel={scopeLabel} />
        </Command>
      </CommandPaletteDialog>

      {traceDialogId ? (
        <TraceExplorerDialog
          traceId={traceDialogId}
          open={Boolean(traceDialogId)}
          onOpenChange={(next) => {
            if (!next) setTraceDialogId(null)
          }}
        />
      ) : null}
    </>
  )
}
