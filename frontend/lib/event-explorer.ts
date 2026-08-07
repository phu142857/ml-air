import type { AuditEvent, ActorType } from "@/lib/audit-event"
import type { EventType, Severity, TimeRange } from "@/components/mlops/event-filters"

export type EventResult = "all" | AuditEvent["status"]

export type EventExplorerFilters = {
  eventType: EventType
  severity: Severity
  timeRange: TimeRange
  actorType: ActorType | "all"
  targetType: string
  action: string
  result: EventResult
  actor: string
  correlationId: string
  traceId: string
  searchQuery: string
}

export type ParsedEventSearch = Partial<
  Pick<EventExplorerFilters, "actor" | "targetType" | "action" | "result" | "traceId" | "correlationId" | "searchQuery">
>

const SEARCH_PREFIXES: Array<{
  prefix: string
  key: keyof ParsedEventSearch
  transform?: (v: string) => string
}> = [
  { prefix: "actor:", key: "actor" },
  { prefix: "resource:", key: "targetType" },
  { prefix: "status:", key: "result" },
  { prefix: "action:", key: "action" },
  { prefix: "trace:", key: "traceId" },
  { prefix: "corr:", key: "correlationId" },
]

/** Parse `actor:admin resource:model status:failed` style queries. */
export function parseEventSearch(raw: string): ParsedEventSearch {
  const query = raw.trim()
  if (!query) return {}

  const tokens = query.split(/\s+/).filter(Boolean)
  const parsed: ParsedEventSearch = {}
  const freeText: string[] = []

  for (const token of tokens) {
    const lower = token.toLowerCase()
    const match = SEARCH_PREFIXES.find((p) => lower.startsWith(p.prefix))
    if (match) {
      const value = token.slice(match.prefix.length).trim()
      if (value) {
        if (match.key === "result") {
          parsed.result = value.toLowerCase() as EventResult
        } else {
          parsed[match.key] = match.transform ? match.transform(value) : value
        }
      }
      continue
    }
    freeText.push(token)
  }

  if (freeText.length) {
    parsed.searchQuery = freeText.join(" ")
  }

  return parsed
}

function timeRangeCutoff(range: TimeRange): number | null {
  if (range === "all") return null
  const hours: Record<Exclude<TimeRange, "all">, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  }
  return Date.now() - hours[range] * 60 * 60 * 1000
}

function matchesFreeText(event: AuditEvent, text: string): boolean {
  const q = text.toLowerCase()
  const haystack = [
    event.title,
    event.description,
    event.action,
    event.actor.name,
    event.resource.name,
    event.resource.type,
    event.resource.id,
    event.traceId,
    event.correlationId,
    event.source,
    ...event.metadataSummary.map((m) => `${m.label} ${m.value}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(q)
}

export function applyEventFilters(events: AuditEvent[], filters: EventExplorerFilters): AuditEvent[] {
  const parsed = parseEventSearch(filters.searchQuery)
  const actor = (parsed.actor || filters.actor).trim().toLowerCase()
  const targetType = (parsed.targetType || filters.targetType).trim().toLowerCase()
  const action = (parsed.action || filters.action).trim().toLowerCase()
  const traceId = (parsed.traceId || filters.traceId).trim().toLowerCase()
  const correlationId = (parsed.correlationId || filters.correlationId).trim().toLowerCase()
  const result = (parsed.result || filters.result) as EventResult
  const freeText = parsed.searchQuery?.trim() ?? ""
  const cutoff = timeRangeCutoff(filters.timeRange)

  return events.filter((event) => {
    if (freeText && !matchesFreeText(event, freeText)) return false
    if (actor && !event.actor.name.toLowerCase().includes(actor)) return false
    if (targetType) {
      const rt = event.resource.type.toLowerCase()
      const cat = event.eventType.toLowerCase()
      if (!rt.includes(targetType) && !cat.includes(targetType)) return false
    }
    if (action && !event.action.toLowerCase().includes(action)) return false
    if (traceId && !event.traceId?.toLowerCase().includes(traceId)) return false
    if (correlationId && !event.correlationId?.toLowerCase().includes(correlationId)) return false
    if (result !== "all" && event.status !== result) return false
    if (filters.eventType !== "all" && event.eventType !== filters.eventType) return false
    if (filters.severity !== "all" && event.severity !== filters.severity) return false
    if (filters.actorType !== "all" && event.actor.type !== filters.actorType) return false
    if (cutoff !== null && new Date(event.timestamp).getTime() < cutoff) return false
    return true
  })
}

export type EventExplorerStats = {
  total: number
  successCount: number
  failedCount: number
  warningCount: number
  runningCount: number
  uniqueActors: number
  datasets: number
  models: number
  runs: number
  avgProcessingMs: number | null
}

export function computeEventStats(events: AuditEvent[]): EventExplorerStats {
  const actors = new Set<string>()
  let datasets = 0
  let models = 0
  let runs = 0
  let durationSum = 0
  let durationCount = 0

  for (const e of events) {
    actors.add(`${e.actor.type}:${e.actor.name}`)
    if (e.eventType === "dataset") datasets += 1
    if (e.eventType === "model") models += 1
    if (e.eventType === "run") runs += 1
    const ms = e.metadata?.duration_ms ?? e.metadata?.latency_ms ?? e.metadata?.processing_ms
    if (typeof ms === "number" && Number.isFinite(ms)) {
      durationSum += ms
      durationCount += 1
    }
  }

  return {
    total: events.length,
    successCount: events.filter((e) => e.status === "success").length,
    failedCount: events.filter((e) => e.status === "failed").length,
    warningCount: events.filter((e) => e.severity === "warning" || e.severity === "error").length,
    runningCount: events.filter((e) => e.status === "running" || e.status === "pending").length,
    uniqueActors: actors.size,
    datasets,
    models,
    runs,
    avgProcessingMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
  }
}

export type TimelineGroupLabel = "Today" | "Yesterday" | "Last Week" | "Earlier"

export type TimelineGroup = {
  label: TimelineGroupLabel
  events: AuditEvent[]
}

export function groupEventsByTimeline(events: AuditEvent[]): TimelineGroup[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000)
  const startOfLastWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000)

  const buckets: Record<TimelineGroupLabel, AuditEvent[]> = {
    Today: [],
    Yesterday: [],
    "Last Week": [],
    Earlier: [],
  }

  for (const event of events) {
    const ts = new Date(event.timestamp)
    if (ts >= startOfToday) buckets.Today.push(event)
    else if (ts >= startOfYesterday) buckets.Yesterday.push(event)
    else if (ts >= startOfLastWeek) buckets["Last Week"].push(event)
    else buckets.Earlier.push(event)
  }

  return (["Today", "Yesterday", "Last Week", "Earlier"] as const)
    .map((label) => ({ label, events: buckets[label] }))
    .filter((g) => g.events.length > 0)
}

export type EventInsightRow = { label: string; count: number; href?: string | null }

export type EventInsights = {
  topActors: EventInsightRow[]
  activeResources: EventInsightRow[]
  frequentTypes: EventInsightRow[]
  recentFailed: AuditEvent[]
  topPipelines: EventInsightRow[]
  topModels: EventInsightRow[]
}

function topCounts(
  items: Array<{ key: string; label: string; href?: string | null }>,
  limit = 5,
): EventInsightRow[] {
  const counts = new Map<string, { label: string; count: number; href?: string | null }>()
  for (const item of items) {
    const prev = counts.get(item.key)
    if (prev) prev.count += 1
    else counts.set(item.key, { label: item.label, count: 1, href: item.href })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => ({ label: row.label, count: row.count, href: row.href }))
}

export function computeEventInsights(events: AuditEvent[]): EventInsights {
  const actorRows = events.map((e) => ({
    key: `${e.actor.type}:${e.actor.name}`,
    label: e.actor.name,
    href: e.actor.href,
  }))
  const resourceRows = events.map((e) => ({
    key: `${e.resource.type}:${e.resource.id}`,
    label: e.resource.name || `${e.resource.type} ${e.resource.id}`,
    href: e.resource.href,
  }))
  const typeRows = events.map((e) => ({
    key: e.action,
    label: e.action.replace(/_/g, " "),
  }))
  const pipelineRows = events
    .filter((e) => e.eventType === "pipeline" || e.resource.type.includes("pipeline"))
    .map((e) => ({
      key: e.resource.id,
      label: e.resource.name || e.resource.id,
      href: e.resource.href,
    }))
  const modelRows = events
    .filter((e) => e.eventType === "model" || e.resource.type.includes("model"))
    .map((e) => ({
      key: e.resource.id,
      label: e.resource.name || e.resource.id,
      href: e.resource.href,
    }))

  return {
    topActors: topCounts(actorRows),
    activeResources: topCounts(resourceRows),
    frequentTypes: topCounts(typeRows),
    recentFailed: events.filter((e) => e.status === "failed").slice(0, 5),
    topPipelines: topCounts(pipelineRows),
    topModels: topCounts(modelRows),
  }
}

export function findRelatedEvents(event: AuditEvent, all: AuditEvent[], limit = 6): AuditEvent[] {
  const corr = event.correlationId?.trim()
  const rid = event.resource.id
  const related = all.filter((e) => {
    if (e.id === event.id) return false
    if (corr && e.correlationId === corr) return true
    if (rid && e.resource.id === rid) return true
    return false
  })
  return related.slice(0, limit)
}

export function neighborEvents(
  event: AuditEvent,
  ordered: AuditEvent[],
): { prev: AuditEvent | null; next: AuditEvent | null } {
  const idx = ordered.findIndex((e) => e.id === event.id)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? ordered[idx - 1] : null,
    next: idx < ordered.length - 1 ? ordered[idx + 1] : null,
  }
}

export const EVENT_STATUS_STYLES: Record<
  AuditEvent["status"] | "cancelled" | "warning",
  { border: string; bg: string; fg: string }
> = {
  success: {
    border: "var(--status-success-border)",
    bg: "var(--status-success-bg)",
    fg: "var(--status-success-fg)",
  },
  failed: {
    border: "var(--status-failed-border)",
    bg: "var(--status-failed-bg)",
    fg: "var(--status-failed-fg)",
  },
  running: {
    border: "var(--status-running-border, var(--status-pending-border))",
    bg: "var(--status-running-bg, var(--status-pending-bg))",
    fg: "var(--status-running-fg, var(--status-pending-fg))",
  },
  pending: {
    border: "var(--status-pending-border)",
    bg: "var(--status-pending-bg)",
    fg: "var(--status-pending-fg)",
  },
  cancelled: {
    border: "var(--status-cancelled-border, var(--border))",
    bg: "var(--status-cancelled-bg, var(--muted))",
    fg: "var(--status-cancelled-fg, var(--muted-foreground))",
  },
  warning: {
    border: "var(--status-pending-border)",
    bg: "var(--status-pending-bg)",
    fg: "var(--status-pending-fg)",
  },
}
