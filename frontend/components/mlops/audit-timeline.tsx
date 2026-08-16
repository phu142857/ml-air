"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  GitBranch,
  HelpCircle,
  Play,
  Server,
  User,
  Wrench,
} from "lucide-react"

import { StatusBadge } from "@/components/mlops/status-badge"
import { TraceLink } from "@/components/mlops/trace-link"
import type { AuditEvent, ActorType } from "@/lib/audit-event"
import { actorTypeLabel } from "@/lib/audit-event"
import { groupEventsByTimeline } from "@/lib/event-explorer"
import { cn, formatDateTimeCompact, formatRelativeTime } from "@/lib/utils"

interface AuditTimelineProps {
  events: AuditEvent[]
  newEventIds?: Set<string>
}

const eventTypeIcons: Record<string, React.ElementType> = {
  run: Play,
  dataset: Database,
  model: Box,
  pipeline: GitBranch,
  system: Server,
}

const eventTypeColors: Record<string, string> = {
  run: "text-primary bg-primary/10",
  dataset: "text-[color:var(--status-success-fg)] bg-[color:var(--status-success-bg)]",
  model: "text-primary bg-primary/10",
  pipeline: "text-[color:var(--status-pending-fg)] bg-[color:var(--status-pending-bg)]",
  system: "text-muted-foreground bg-muted",
}

const actorIcons: Record<ActorType, React.ElementType> = {
  user: User,
  service_account: Bot,
  scheduler: Clock,
  worker: Wrench,
  plugin: Box,
  system: Server,
}

function ActorRow({ actor }: { actor: AuditEvent["actor"] }) {
  const Icon = actorIcons[actor.type] ?? Server
  const inner = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground">{actor.name}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {actorTypeLabel(actor.type)}
        </span>
      </span>
    </span>
  )

  if (actor.href) {
    return (
      <Link href={actor.href} className="rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40">
        {inner}
      </Link>
    )
  }
  return inner
}

function MetadataSummary({ chips }: { chips: AuditEvent["metadataSummary"] }) {
  if (!chips.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={`${chip.label}-${chip.value}`}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">{chip.label}:</span>
          <span className="truncate">{chip.value}</span>
        </span>
      ))}
    </div>
  )
}

interface AuditTimelineItemProps {
  event: AuditEvent
  isLast: boolean
  isNew?: boolean
}

function AuditTimelineItem({ event, isLast, isNew }: AuditTimelineItemProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = eventTypeIcons[event.eventType] || HelpCircle
  const iconColor = eventTypeColors[event.eventType] || "text-muted-foreground bg-muted"

  const statusMap: Record<string, "success" | "failed" | "running" | "pending" | "cancelled"> = {
    success: "success",
    failed: "failed",
    running: "running",
    pending: "pending",
    cancelled: "cancelled",
  }

  return (
    <div
      className={cn(
        "relative flex gap-4",
        isNew && "animate-highlight-pulse rounded-lg bg-primary/[0.04] ring-1 ring-primary/25",
      )}
    >
      {!isLast ? <div className="absolute bottom-0 left-[19px] top-10 w-px bg-muted" /> : null}

      <div
        className={cn(
          "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background",
          iconColor,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "panel-surface overflow-hidden transition-all duration-200",
            expanded && "shadow-md",
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="interactive-row flex w-full items-start gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-medium text-foreground">{event.title}</h3>
                <StatusBadge status={statusMap[event.status] || "pending"} size="sm" />
                {event.severity !== "info" ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      event.severity === "warning" &&
                        "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
                      event.severity === "error" &&
                        "bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
                      event.severity === "critical" && "bg-red-500/20 text-red-300",
                    )}
                  >
                    {event.severity}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <ActorRow actor={event.actor} />
                <div className="min-w-0 text-xs text-muted-foreground">
                  {event.resource.href ? (
                    <Link
                      href={event.resource.href}
                      className="font-medium link-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatResourceTarget(event)}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground/80">{formatResourceTarget(event)}</span>
                  )}
                </div>
              </div>

              <MetadataSummary chips={event.metadataSummary} />
            </div>

            <div className="ml-2 flex shrink-0 items-center gap-3">
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatDateTimeCompact(event.timestamp)}
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {expanded ? (
            <div className="animate-in zoom-in-95 space-y-4 border-t border-border p-4 duration-200">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailField label="Event ID" value={event.id} mono />
                <DetailField label="Occurred at" value={new Date(event.timestamp).toISOString()} mono />
                <DetailField label="Correlation ID" value={event.correlationId || "—"} mono />
                <DetailField label="Trace ID" value={event.traceId || "—"} mono />
                <DetailField label="Tenant" value={event.tenantId || "—"} />
                <DetailField label="Project" value={event.projectId || "—"} />
                <DetailField label="Action" value={event.action} />
                <DetailField label="Source" value={event.source || "—"} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Actor
                  </label>
                  <div className="mt-1">
                    <ActorRow actor={event.actor} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Target
                  </label>
                  <p className="mt-1 text-sm text-foreground/90">{formatResourceTarget(event)}</p>
                </div>
              </div>

              {event.metadata && Object.keys(event.metadata).length > 0 ? (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Payload
                  </label>
                  <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-background/50 p-3 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}

              {event.traceId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
                  <div className="min-w-0 flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Trace
                    </label>
                    <p className="mt-0.5 break-all font-mono text-sm text-muted-foreground">{event.traceId}</p>
                  </div>
                  <TraceLink traceId={event.traceId} className="shrink-0" />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </label>
      <p className={cn("mt-1 text-sm text-foreground/90", mono && "font-mono text-muted-foreground")}>
        {value}
      </p>
    </div>
  )
}

function formatResourceTarget(event: AuditEvent): string {
  const typeLabel = event.resource.type.replace(/_/g, " ")
  if (event.resource.name && event.resource.name !== event.resource.id) {
    return `${typeLabel} · ${event.resource.name}`
  }
  return `${typeLabel} · ${event.resource.id || "—"}`
}

export function AuditTimeline({ events, newEventIds }: AuditTimelineProps) {
  const groups = useMemo(() => groupEventsByTimeline(events), [events])

  if (!events || events.length === 0) {
    return (
      <div className="surface-muted flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-card">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No events found</p>
        <p className="mt-1 max-w-[240px] text-xs text-muted-foreground/80">
          Domain events will appear here as the platform records audit and lifecycle activity
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group, groupIndex) => (
        <section key={group.label} className="space-y-4">
          <div
            className={cn(
              "flex items-center gap-3",
              groupIndex > 0 && "border-t border-border/60 pt-6",
            )}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <div className="space-y-4">
            {group.events.map((event, index) => (
              <AuditTimelineItem
                key={event.id}
                event={event}
                isLast={index === group.events.length - 1}
                isNew={newEventIds?.has(event.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
