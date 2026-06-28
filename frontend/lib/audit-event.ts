import type { AuditTimelineItem } from "@/lib/api"

export type AuditEvent = {
  id: string
  timestamp: string
  eventType: "run" | "dataset" | "model" | "pipeline" | "system"
  severity: "info" | "warning" | "error" | "critical"
  title: string
  description: string
  actor: { name: string; type: "user" | "service" | "schedule" }
  status: "success" | "failed" | "pending" | "running"
  traceId?: string
  traceparent?: string
  metadata?: Record<string, unknown>
}

function mapResourceType(rt: string): AuditEvent["eventType"] {
  const k = rt.toLowerCase()
  if (k === "run" || k === "task") return "run"
  if (k === "dataset" || k === "dataset_version") return "dataset"
  if (k === "model" || k === "model_version") return "model"
  if (k === "pipeline" || k === "pipeline_version") return "pipeline"
  return "system"
}

function mapStatus(payload: Record<string, unknown>, kind: string): AuditEvent["status"] {
  const raw = String(payload.status ?? payload.readiness_status ?? payload.approval_status ?? kind ?? "")
    .toUpperCase()
  if (raw.includes("FAIL") || raw.includes("ERROR") || raw.includes("REJECT") || raw.includes("BLOCK")) return "failed"
  if (raw.includes("ELIGIBLE") || raw.includes("READY")) return "success"
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

function pickTraceId(payload: Record<string, unknown>): string | undefined {
  for (const key of ["trace_id", "traceId", "traceparent"]) {
    const v = payload[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

function pickActor(payload: Record<string, unknown>, source: string | null): AuditEvent["actor"] {
  const name = String(payload.actor ?? payload.user ?? payload.subject ?? source ?? "mlair").trim() || "mlair"
  const typeRaw = String(payload.actor_type ?? payload.actorType ?? "service").toLowerCase()
  if (typeRaw.includes("user")) return { name, type: "user" }
  if (typeRaw.includes("sched")) return { name, type: "schedule" }
  return { name, type: "service" }
}

/** Next.js route for an audit row when resource_type + id are known. */
export function auditResourceHref(item: AuditTimelineItem): string | null {
  const id = String(item.resource_id || "").trim()
  if (!id) return null
  const rt = String(item.resource_type || "").toLowerCase()
  if (rt === "task") return `/tasks/${encodeURIComponent(id)}`
  if (rt === "run") return `/runs/${encodeURIComponent(id)}`
  if (rt === "dataset" || rt === "dataset_version") return `/datasets/${encodeURIComponent(id)}`
  if (rt === "pipeline" || rt === "pipeline_version") return `/pipelines/${encodeURIComponent(id)}`
  if (rt === "model" || rt === "model_version") return `/models/${encodeURIComponent(id)}`
  return null
}

export function auditEventTitle(item: AuditTimelineItem): string {
  const k = String(item.kind || "event")
  const rt = String(item.resource_type || "?")
  const rid = String(item.resource_id || "—")
  return `${k} · ${rt} ${rid}`
}

export function auditEventDescription(item: AuditTimelineItem): string {
  const src = item.source?.trim()
  const payload = item.payload || {}
  const msg = payload.message ?? payload.detail ?? payload.reason
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  if (src) return `Source: ${src}`
  const keys = Object.keys(payload)
  if (!keys.length) return "No additional payload"
  return `Payload: ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`
}

export function mapAuditTimelineItem(item: AuditTimelineItem, index = 0): AuditEvent {
  const payload = (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<string, unknown>
  const kind = String(item.kind || "event")
  const status = mapStatus(payload, kind)
  const ts = item.ts?.trim() || new Date().toISOString()
  const traceId = pickTraceId(payload)
  const traceparent = typeof payload.traceparent === "string" ? payload.traceparent : undefined

  return {
    id: `${ts}|${kind}|${item.resource_type}|${item.resource_id}|${index}`,
    timestamp: ts,
    eventType: mapResourceType(String(item.resource_type || "")),
    severity: mapSeverity(status, payload),
    title: auditEventTitle(item),
    description: auditEventDescription(item),
    actor: pickActor(payload, item.source),
    status,
    traceId,
    traceparent,
    metadata: payload,
  }
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
    "description",
    "event_type",
    "severity",
    "status",
    "trace_id",
    "actor_name",
    "actor_type",
  ]
  const rows = events.map((e) =>
    [
      e.id,
      e.timestamp,
      e.title,
      e.description,
      e.eventType,
      e.severity,
      e.status,
      e.traceId ?? "",
      e.actor.name,
      e.actor.type,
    ]
      .map((c) => csvCell(String(c)))
      .join(","),
  )
  return [headers.join(","), ...rows].join("\n")
}
