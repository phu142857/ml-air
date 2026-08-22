import type { LucideIcon } from "lucide-react"
import {
  Ban,
  CheckCircle2,
  CirclePlay,
  Database,
  GitBranch,
  Loader2,
  Package,
  PackagePlus,
  RotateCcw,
  Server,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  User,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react"
import type { AuditEvent } from "@/lib/audit-event"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_ID_RE = /^[0-9a-f]{24,}$/i

export function isOpaqueId(value: string): boolean {
  const t = value.trim()
  if (!t) return false
  if (UUID_RE.test(t)) return true
  if (HEX_ID_RE.test(t)) return true
  if (t.length >= 20 && !t.includes(" ")) return true
  return false
}

export function shortId(id: string, prefix: string): string {
  const slug = id.trim().slice(0, 8)
  return `${prefix} #${slug}`
}

export function shortResourceLabel(event: AuditEvent): string {
  const id = event.resource.id.trim()
  const name = event.resourceName.trim()
  if (name && name !== id && !isOpaqueId(name)) return name

  const rt = event.eventType
  if (rt === "run") return id ? shortId(id, "Run") : "Run"
  if (rt === "dataset") return id ? shortId(id, "Dataset") : "Dataset"
  if (rt === "model") return id ? shortId(id, "Model") : "Model"
  if (rt === "pipeline") return id ? shortId(id, "Pipeline") : "Pipeline"
  if (id) return shortId(id, "Resource")
  return name || "Resource"
}

export type TimelineIconKind =
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "run_running"
  | "run_cancelled"
  | "dataset_created"
  | "dataset_deleted"
  | "model_registered"
  | "model_promoted"
  | "model_rollback"
  | "model_deleted"
  | "approval"
  | "rejection"
  | "pipeline"
  | "pipeline_failed"
  | "webhook"
  | "system"
  | "user"
  | "security"
  | "default"

const ICON_MAP: Record<TimelineIconKind, LucideIcon> = {
  run_started: CirclePlay,
  run_completed: CheckCircle2,
  run_failed: XCircle,
  run_running: Loader2,
  run_cancelled: Ban,
  dataset_created: Database,
  dataset_deleted: Trash2,
  model_registered: PackagePlus,
  model_promoted: Zap,
  model_rollback: RotateCcw,
  model_deleted: Trash2,
  approval: ShieldCheck,
  rejection: ShieldX,
  pipeline: GitBranch,
  pipeline_failed: GitBranch,
  webhook: Webhook,
  system: Server,
  user: User,
  security: Shield,
  default: Package,
}

export function resolveTimelineIconKind(event: AuditEvent): TimelineIconKind {
  const kind = event.action.toLowerCase()

  if (kind.includes("webhook")) return "webhook"
  if (kind.includes("audit") || kind.includes("security") || kind.includes("auth")) return "security"
  if (kind.includes("approv") && !kind.includes("reject")) return "approval"
  if (kind.includes("reject")) return "rejection"

  if (kind.includes("dataset.deleted") || (kind.includes("dataset") && kind.includes("delet")))
    return "dataset_deleted"
  if (kind.includes("dataset.created") || (kind.includes("dataset") && kind.includes("creat")))
    return "dataset_created"

  if (kind.includes("rollback")) return "model_rollback"
  if (kind.includes("promot") || kind.includes("stage_updated")) return "model_promoted"
  if (kind.includes("model.version.deleted") || kind.includes("model_version.deleted")) return "model_deleted"
  if (kind.includes("model.version.created") || kind.includes("model_version.created")) return "model_registered"

  if (kind.includes("pipeline") && kind.includes("fail")) return "pipeline_failed"
  if (kind.includes("pipeline")) return "pipeline"

  if (kind.includes("run.created")) return "run_started"
  if (kind.includes("run.updated") || kind.includes("run.")) {
    if (event.status === "failed" || kind.includes("fail")) return "run_failed"
    if (event.status === "cancelled" || kind.includes("cancel")) return "run_cancelled"
    if (event.status === "running") return "run_running"
    if (event.status === "success") return "run_completed"
  }
  if (event.eventType === "run") {
    if (event.status === "failed") return "run_failed"
    if (event.status === "running") return "run_running"
    if (event.status === "success") return "run_completed"
    return "run_started"
  }

  if (event.actor.type === "user") return "user"
  if (event.eventType === "system" || event.actor.type === "scheduler" || event.actor.type === "worker")
    return "system"

  return "default"
}

export function resolveTimelineIcon(event: AuditEvent): LucideIcon {
  return ICON_MAP[resolveTimelineIconKind(event)]
}

export function timelineIconTone(event: AuditEvent): string {
  const kind = resolveTimelineIconKind(event)
  if (kind === "run_failed" || kind === "rejection" || kind === "pipeline_failed")
    return "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]"
  if (kind === "run_completed" || kind === "approval" || kind === "model_promoted")
    return "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]"
  if (kind === "run_running")
    return "border-[color:var(--status-running-border)] bg-[color:var(--status-running-bg)] text-[color:var(--status-running-fg)]"
  if (kind === "run_cancelled" || kind === "dataset_deleted" || kind === "model_deleted")
    return "border-border bg-muted text-muted-foreground"
  if (event.severity === "warning")
    return "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]"
  return "border-border bg-background text-muted-foreground"
}

export type TimelineCardChip = { label: string; value: string }

/** Extra context only — resource name already appears in the event sentence. */
export function buildTimelineCardChips(event: AuditEvent): TimelineCardChip[] {
  const chips: TimelineCardChip[] = []
  const pipeline = String(event.metadata?.pipeline_name ?? "").trim()
  if (pipeline && !isOpaqueId(pipeline)) {
    chips.push({ label: "Pipeline", value: pipeline })
  }
  return chips
}
