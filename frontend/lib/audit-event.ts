import type { AuditTimelineItem } from "@/lib/api"
import { formatEventSentence } from "@/lib/event-sentence"
import { taskIdPathSegment } from "@/lib/api"

export type ActorType =
  | "user"
  | "service_account"
  | "scheduler"
  | "worker"
  | "plugin"
  | "system"

export type ResourceCategory = "run" | "dataset" | "model" | "pipeline" | "system"

export type MetadataChip = { label: string; value: string }

export type AuditEvent = {
  id: string
  timestamp: string
  eventType: ResourceCategory
  action: string
  severity: "info" | "warning" | "error" | "critical"
  title: string
  /** Human-readable GitHub-style sentence */
  sentence: string
  resourceName: string
  description: string
  actor: {
    name: string
    type: ActorType
    id?: string
    href: string | null
  }
  status: "success" | "failed" | "pending" | "running" | "cancelled"
  resource: {
    type: string
    id: string
    name: string
    href: string | null
    category: ResourceCategory
  }
  traceId?: string
  correlationId?: string
  traceparent?: string
  tenantId?: string
  projectId?: string
  source?: string | null
  metadata?: Record<string, unknown>
  metadataSummary: MetadataChip[]
  raw: AuditTimelineItem
}

const KIND_LABELS: Record<string, string> = {
  promote: "Promoted",
  promoted: "Promoted",
  rollback: "Rolled back",
  approved: "Approved",
  rejected: "Rejected",
  created: "Created",
  deleted: "Deleted",
  updated: "Updated",
  version_created: "Version created",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  readiness_evaluated: "Readiness evaluated",
  run_created: "Run created",
  run_updated: "Run updated",
  pipeline_triggered: "Pipeline triggered",
}

function mapResourceCategory(rt: string): ResourceCategory {
  const k = rt.toLowerCase()
  if (k === "run" || k === "task") return "run"
  if (k === "dataset" || k === "dataset_version") return "dataset"
  if (k === "model" || k === "model_version") return "model"
  if (k === "pipeline" || k === "pipeline_version") return "pipeline"
  return "system"
}

function formatResourceLabel(rt: string): string {
  return rt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function mapStatus(payload: Record<string, unknown>, kind: string): AuditEvent["status"] {
  const raw = String(
    payload.status ?? payload.readiness_status ?? payload.approval_status ?? payload.outcome ?? kind ?? "",
  ).toUpperCase()
  if (raw.includes("CANCEL")) return "cancelled"
  if (raw.includes("FAIL") || raw.includes("ERROR") || raw.includes("REJECT") || raw.includes("BLOCK")) {
    return "failed"
  }
  if (raw.includes("ELIGIBLE") || raw.includes("READY") || raw.includes("SUCCESS") || raw.includes("COMPLETE")) {
    return "success"
  }
  if (raw.includes("RUN") || raw.includes("PROGRESS")) return "running"
  if (raw.includes("PEND") || raw.includes("QUEUE") || raw.includes("WAIT")) return "pending"
  return "success"
}

function mapSeverity(status: AuditEvent["status"], payload: Record<string, unknown>): AuditEvent["severity"] {
  if (status === "failed") return "error"
  const raw = String(payload.severity ?? payload.level ?? "").toLowerCase()
  if (raw.includes("crit")) return "critical"
  if (raw.includes("warn")) return "warning"
  if (raw.includes("err")) return "error"
  return "info"
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = payload[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

function pickTraceId(payload: Record<string, unknown>): string | undefined {
  return pickString(payload, ["trace_id", "traceId", "traceparent"])
}

function pickCorrelationId(payload: Record<string, unknown>): string | undefined {
  return pickString(payload, ["correlation_id", "correlationId", "corr_id"])
}

function normalizeActorType(raw: string): ActorType {
  const t = raw.toLowerCase()
  if (t.includes("user")) return "user"
  if (t.includes("service") && t.includes("account")) return "service_account"
  if (t.includes("sched")) return "scheduler"
  if (t.includes("worker")) return "worker"
  if (t.includes("plugin")) return "plugin"
  if (t.includes("system")) return "system"
  return "system"
}

function actorHref(type: ActorType, id?: string): string | null {
  if (!id) return null
  if (type === "user") return `/identity/users/${encodeURIComponent(id)}`
  if (type === "service_account") return `/identity/service-accounts/${encodeURIComponent(id)}`
  if (type === "worker") return `/infra`
  return null
}

function pickActor(payload: Record<string, unknown>, source: string | null): AuditEvent["actor"] {
  const id = pickString(payload, ["actor_id", "actorId", "user_id", "userId", "subject_id"])
  const kindRaw =
    pickString(payload, ["actor_type", "actorType", "actor_kind", "principal_type"]) ||
    (source?.trim().toLowerCase().includes("sched") ? "scheduler" : undefined)
  const type = normalizeActorType(kindRaw || "system")
  let name =
    pickString(payload, ["actor_name", "actorName", "actor", "user", "subject", "principal"]) ||
    undefined
  if (!name && id) {
    name = id
  }
  if (!name && source?.trim()) {
    name = source.trim()
  }
  if (!name) {
    name = type === "system" ? "System" : actorTypeLabel(type)
  }
  return { name, type, id, href: actorHref(type, id) }
}

function pickResourceName(payload: Record<string, unknown>, resourceId: string): string {
  return (
    pickString(payload, [
      "resource_name",
      "name",
      "model_name",
      "dataset_name",
      "pipeline_name",
      "run_name",
      "title",
    ]) || resourceId
  )
}

function buildMetadataSummary(
  payload: Record<string, unknown>,
  kind: string,
  status: AuditEvent["status"],
): MetadataChip[] {
  const chips: MetadataChip[] = []
  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return
    chips.push({ label, value: String(value) })
  }

  const from = pickString(payload, ["from_stage", "from", "source_stage"])
  const to = pickString(payload, ["to_stage", "to", "target_stage"])
  if (from && to) push("Stage", `${from} → ${to}`)

  push("Version", payload.version ?? payload.dataset_version ?? payload.pipeline_version ?? payload.model_version)
  push("Run status", payload.run_status ?? (kind.includes("run") ? status : undefined))
  push("Retries", payload.retry_count ?? payload.retries)
  push("Reason", payload.failure_reason ?? payload.reason ?? payload.error)
  push("Prompt version", payload.prompt_version)
  push("Cost", payload.cost_usd ?? payload.cost)
  push("GPU", payload.gpu ?? payload.gpu_type)
  push("Latency", payload.latency_ms ?? payload.duration_ms)

  return chips.slice(0, 4)
}

function formatEventTitle(kind: string, resourceType: string, resourceName: string): string {
  const action = KIND_LABELS[kind.toLowerCase()] || kind.replace(/_/g, " ")
  const resource = formatResourceLabel(resourceType)
  if (resourceName && resourceName !== "—") return `${action} · ${resourceName}`
  return `${action} · ${resource}`
}

/** Next.js route for an audit row when resource_type + id are known. */
export function auditResourceHref(item: AuditTimelineItem): string | null {
  const id = String(item.resource_id || "").trim()
  if (!id) return null
  const rt = String(item.resource_type || "").toLowerCase()
  if (rt === "task") return `/tasks/${taskIdPathSegment(id)}`
  if (rt === "run") return `/runs/${encodeURIComponent(id)}`
  if (rt === "dataset" || rt === "dataset_version") return `/datasets/${encodeURIComponent(id)}`
  if (rt === "pipeline" || rt === "pipeline_version") return `/pipelines/${encodeURIComponent(id)}`
  if (rt === "model" || rt === "model_version") return `/models/${encodeURIComponent(id)}`
  if (rt === "cluster" || rt === "region" || rt === "node") return `/infra`
  return null
}

export function auditEventTitle(item: AuditTimelineItem): string {
  const payload = (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<
    string,
    unknown
  >
  const kind = String(item.kind || "event")
  const resourceId = String(item.resource_id || "—")
  const resourceName = pickResourceName(payload, resourceId)
  return formatEventTitle(kind, String(item.resource_type || "resource"), resourceName)
}

export function auditEventDescription(item: AuditTimelineItem): string {
  const src = item.source?.trim()
  const payload = item.payload || {}
  const msg = payload.message ?? payload.detail ?? payload.reason ?? payload.summary
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  if (src) return `Source: ${src}`
  const keys = Object.keys(payload)
  if (!keys.length) return "No additional payload"
  return `Payload: ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`
}

export function actorTypeLabel(type: ActorType): string {
  const labels: Record<ActorType, string> = {
    user: "USER",
    service_account: "SERVICE ACCOUNT",
    scheduler: "SCHEDULER",
    worker: "WORKER",
    plugin: "PLUGIN",
    system: "SYSTEM",
  }
  return labels[type]
}

export function mapAuditTimelineItem(item: AuditTimelineItem, index = 0): AuditEvent {
  const payload = (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<
    string,
    unknown
  >
  const kind = String(item.kind || "event")
  const resourceType = String(item.resource_type || "resource")
  const resourceId = String(item.resource_id || "")
  const category = mapResourceCategory(resourceType)
  const status = mapStatus(payload, kind)
  const ts = item.ts?.trim() || new Date().toISOString()
  const traceId = pickTraceId(payload)
  const correlationId = pickCorrelationId(payload)
  const traceparent = typeof payload.traceparent === "string" ? payload.traceparent : undefined
  const resourceName = pickResourceName(payload, resourceId || "—")
  const href = auditResourceHref(item)

  const mapped: AuditEvent = {
    id: `${ts}|${kind}|${resourceType}|${resourceId}|${index}`,
    timestamp: ts,
    eventType: category,
    action: kind,
    severity: mapSeverity(status, payload),
    title: formatEventTitle(kind, resourceType, resourceName),
    sentence: "",
    resourceName,
    description: auditEventDescription(item),
    actor: pickActor(payload, item.source),
    status,
    resource: {
      type: resourceType,
      id: resourceId,
      name: resourceName,
      href,
      category,
    },
    traceId,
    correlationId,
    traceparent,
    tenantId: pickString(payload, ["tenant_id", "tenantId"]),
    projectId: pickString(payload, ["project_id", "projectId"]),
    source: item.source,
    metadata: payload,
    metadataSummary: buildMetadataSummary(payload, kind, status),
    raw: item,
  }
  mapped.sentence = formatEventSentence(mapped)
  return mapped
}

export function mapAuditTimelineItems(items: AuditTimelineItem[]): AuditEvent[] {
  if (!Array.isArray(items)) return []
  return items.map((item, i) => mapAuditTimelineItem(item, i))
}

function csvCell(value: string): string {
  const v = value.replace(/"/g, '""')
  return /[",\n\r]/.test(v) ? `"${v}"` : v
}

/** Export visible audit events as CSV (client-side, respects UI filters). */
export function auditEventsToCsv(events: AuditEvent[]): string {
  const headers = [
    "id",
    "timestamp",
    "title",
    "action",
    "description",
    "event_type",
    "resource_type",
    "resource_id",
    "severity",
    "status",
    "trace_id",
    "correlation_id",
    "actor_name",
    "actor_type",
  ]
  const rows = events.map((e) =>
    [
      e.id,
      e.timestamp,
      e.title,
      e.action,
      e.description,
      e.eventType,
      e.resource.type,
      e.resource.id,
      e.severity,
      e.status,
      e.traceId ?? "",
      e.correlationId ?? "",
      e.actor.name,
      e.actor.type,
    ]
      .map((c) => csvCell(String(c)))
      .join(","),
  )
  return [headers.join(","), ...rows].join("\n")
}
