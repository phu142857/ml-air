import type { AuditEvent, ActorType } from "@/lib/audit-event"
import { isOpaqueId, shortId } from "@/lib/timeline-display"

function quoted(s: string): string {
  const t = s.trim()
  if (!t || t === "—") return ""
  return `"${t}"`
}

function resourcePhrase(event: AuditEvent): string {
  const name = event.resourceName.trim()
  const id = event.resource.id.trim()
  if (name && name !== id && !isOpaqueId(name)) return quoted(name)
  if (id) {
    const rt = event.eventType
    if (rt === "run") return shortId(id, "Run")
    if (rt === "dataset") return quoted(name) || shortId(id, "Dataset")
    if (rt === "model") return shortId(id, "Model")
    if (rt === "pipeline") return shortId(id, "Pipeline")
    return shortId(id, "Resource")
  }
  return quoted(name) || formatResourceType(event.resource.type)
}

function versionLabel(event: AuditEvent): string {
  const v = event.metadata?.version ?? event.metadata?.model_version
  if (v != null && String(v).trim()) return `v${v}`
  if (event.resourceName && event.resourceName !== event.resource.id) return event.resourceName
  return formatResourceType(event.resource.type)
}

function formatResourceType(rt: string): string {
  return rt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function stageLabel(event: AuditEvent): string {
  return String(
    event.metadata?.to_stage ??
      event.metadata?.stage ??
      event.metadataSummary.find((c) => c.label === "Stage")?.value?.split("→").pop()?.trim() ??
      "Production",
  )
}

/** GitHub-style human sentence — never raw kind strings. */
export function formatEventSentence(event: AuditEvent): string {
  const kind = event.action.toLowerCase()
  const name = event.resourceName
  const pipeline = String(event.metadata?.pipeline_id ?? event.metadata?.pipeline_name ?? "").trim()

  if (kind.includes("dataset.created"))
    return `Created Dataset ${resourcePhrase(event)}`
  if (kind.includes("dataset.deleted"))
    return `Deleted Dataset ${resourcePhrase(event)}`
  if (kind.includes("readiness"))
    return `Evaluated readiness for Dataset ${resourcePhrase(event)}`
  if (kind.includes("model.version.created") || kind.includes("model_version.created"))
    return `Registered Model Version ${versionLabel(event)}`
  if (kind.includes("approval") || kind.includes("approved"))
    return `Approved Model Version ${versionLabel(event)}`
  if (kind.includes("reject"))
    return `Rejected Model Version ${versionLabel(event)}`
  if (kind.includes("stage_updated") || kind.includes("promoted") || kind.includes("promote"))
    return `Promoted Model Version ${versionLabel(event)} to ${stageLabel(event)}`
  if (kind.includes("rollback"))
    return `Rolled back Model Version ${versionLabel(event)}`
  if (kind.includes("model.version.deleted") || kind.includes("model_version.deleted"))
    return `Deleted Model Version ${versionLabel(event)}`
  if (kind.includes("run.created"))
    return `Started ${resourcePhrase(event)}`
  if (kind.includes("run.updated")) {
    const ref = resourcePhrase(event)
    const st = String(event.metadata?.status ?? event.status).toUpperCase()
    if (st.includes("FAIL")) return `${ref} failed`
    if (st.includes("CANCEL")) return `Cancelled ${ref}`
    if (st.includes("SUCCESS") || st.includes("COMPLETE")) return `Completed ${ref}`
    if (st.includes("RUN")) return `${ref} is running`
    return `Updated ${ref}`
  }
  if (kind.includes("pipeline.version") || kind.includes("pipeline_version"))
    return `Created Pipeline version ${versionLabel(event)}`
  if (kind.includes("pipeline") && kind.includes("fail")) {
    const pl = pipeline && !isOpaqueId(pipeline) ? quoted(pipeline) : resourcePhrase(event)
    return `Pipeline ${pl || "job"} failed`
  }
  if (kind.includes("task.created")) return `Created task for run`
  if (kind.includes("task.updated")) return `Updated task status`
  if (kind.includes("serving")) return `Updated serving slot for model`

  const verb = kind.split(".").pop()?.replace(/_/g, " ") ?? "updated"
  const target = resourcePhrase(event)
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${target}`
}

export function actorRoleLabel(type: ActorType, name?: string): string {
  const n = (name || "").toLowerCase()
  if (type === "user") {
    if (n === "admin" || n.includes("administrator")) return "Administrator"
    return "User"
  }
  if (type === "service_account") return "Service Account"
  if (type === "scheduler") return "System"
  if (type === "worker") return "Worker"
  if (type === "plugin") return "Plugin"
  return "System"
}

export type StatusDisplay =
  | "Running"
  | "Queued"
  | "Completed"
  | "Succeeded"
  | "Failed"
  | "Cancelled"
  | "Warning"
  | "Skipped"
  | "Approved"
  | "Rejected"
  | "Promoted"
  | "Archived"
  | "Deleted"
  | "Info"

export function statusDisplayLabel(event: AuditEvent): StatusDisplay {
  const kind = event.action.toLowerCase()
  if (kind.includes("approv") && !kind.includes("reject")) return "Approved"
  if (kind.includes("reject")) return "Rejected"
  if (kind.includes("promot") || kind.includes("stage_updated")) return "Promoted"
  if (kind.includes("deleted")) return "Deleted"
  if (event.severity === "warning") return "Warning"
  if (event.status === "running") return "Running"
  if (event.status === "pending") return "Queued"
  if (event.status === "cancelled") return "Cancelled"
  if (event.status === "failed") return "Failed"
  if (event.status === "success") return "Succeeded"
  return "Info"
}

export function actorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return name.slice(0, 2).toUpperCase() || "?"
}
