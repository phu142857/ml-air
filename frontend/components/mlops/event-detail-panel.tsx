"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AuditEvent } from "@/lib/audit-event"
import { findRelatedEvents, neighborEvents } from "@/lib/event-explorer"
import { actorInitials, actorRoleLabel, statusDisplayLabel } from "@/lib/event-sentence"

function pickMetaString(
  metadata: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = metadata[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

interface EventDetailPanelProps {
  event: AuditEvent | null
  allEvents: AuditEvent[]
  open: boolean
  onClose: () => void
  onSelect: (event: AuditEvent) => void
  /**
   * `embedded` — fills the grid detail column (preferred).
   * `sheet` — kept for callers that still need a drawer (unused by Lifecycle).
   */
  mode?: "embedded" | "sheet" | "panel"
  className?: string
}

function DetailBody({
  event,
  allEvents,
  onSelect,
  onClose,
}: {
  event: AuditEvent
  allEvents: AuditEvent[]
  onSelect: (e: AuditEvent) => void
  onClose: () => void
}) {
  const { prev, next } = neighborEvents(event, allEvents)
  const related = findRelatedEvents(event, allEvents)
  const role = actorRoleLabel(event.actor.type, event.actor.name)
  const showRole =
    role.trim().length > 0 &&
    role.trim().toLowerCase() !== event.actor.name.trim().toLowerCase()
  const statusLabel = statusDisplayLabel(event)
  const ip = pickMetaString(event.metadata ?? {}, "ip", "client_ip")
  const ua = pickMetaString(event.metadata ?? {}, "user_agent", "userAgent")
  const [rawOpen, setRawOpen] = useState(false)
  const hasRaw = Boolean(event.metadata && Object.keys(event.metadata).length > 0)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Event Summary */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Event Summary
          </p>
          <p className="mt-1 break-words text-sm font-medium leading-snug">{event.sentence}</p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <div className="space-y-5 p-4">
          {/* Actor */}
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Actor
            </h4>
            <div className="flex items-center gap-3">
              <Avatar className="size-9 border border-border">
                <AvatarFallback>{actorInitials(event.actor.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{event.actor.name}</p>
                {showRole ? <p className="text-xs text-muted-foreground">{role}</p> : null}
              </div>
            </div>
          </section>

          {/* Timestamp + Status + Target + Correlation */}
          <section className="grid gap-3 text-sm">
            <Row label="Timestamp" value={format(new Date(event.timestamp), "PPpp")} />
            <Row label="Status">
              <Badge variant="outline" className="text-xs">
                {statusLabel}
              </Badge>
            </Row>
            <Row label="Target" value={event.resourceName || event.resource.name || event.resource.type} />
            {event.correlationId ? (
              <Row label="Correlation" value={event.correlationId} mono />
            ) : null}
            {event.projectId ? <Row label="Project" value={event.projectId} mono /> : null}
            {event.tenantId ? <Row label="Tenant" value={event.tenantId} mono /> : null}
            {event.source ? <Row label="Source" value={event.source} /> : null}
            {event.traceId ? <Row label="Trace" value={event.traceId} mono /> : null}
            {ip ? <Row label="IP" value={ip} mono /> : null}
            {ua ? <Row label="User Agent" value={ua} className="break-all" /> : null}
          </section>

          {/* Metadata */}
          {event.metadataSummary.length > 0 ? (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Metadata
              </h4>
              <dl className="space-y-2 text-sm">
                {event.metadataSummary.map((chip) => (
                  <div key={chip.label} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{chip.label}</dt>
                    <dd className="text-right font-mono text-xs">{chip.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* Raw Payload */}
          {hasRaw ? (
            <section>
              <button
                type="button"
                onClick={() => setRawOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                {rawOpen ? (
                  <ChevronDown className="size-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden />
                )}
                Raw Payload
              </button>
              {rawOpen ? (
                <pre className="mt-2 max-h-48 overflow-auto break-all rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              ) : null}
            </section>
          ) : null}

          {/* Related navigation */}
          <section>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Related
            </h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!prev}
                onClick={() => prev && onSelect(prev)}
              >
                <ArrowUp className="mr-1 size-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!next}
                onClick={() => next && onSelect(next)}
              >
                Next
                <ArrowDown className="ml-1 size-3.5" />
              </Button>
            </div>
            {related.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {related.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(r)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                    >
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{r.sentence}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="flex flex-col gap-2">
            {event.resource.href ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={event.resource.href}>
                  Open resource
                  <ExternalLink className="ml-2 size-3.5" />
                </Link>
              </Button>
            ) : null}
            {event.traceId ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/traces?trace=${encodeURIComponent(event.traceId)}`}>
                  Open trace
                  <ExternalLink className="ml-2 size-3.5" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  children,
  mono,
  className,
}: {
  label: string
  value?: string
  children?: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,6.5rem)_1fr] gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children ?? (
        <span className={cn("min-w-0 break-words text-right", mono && "font-mono text-xs", className)}>
          {value}
        </span>
      )}
    </div>
  )
}

export function EventDetailPanel({
  event,
  allEvents,
  open,
  onClose,
  onSelect,
  mode = "embedded",
  className,
}: EventDetailPanelProps) {
  if (!event || !open) return null

  if (mode === "sheet") {
    // Lazy import path avoided — sheet mode unused by Lifecycle page.
    // Keep a simple full-height embed fallback if called.
    return (
      <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
        <DetailBody event={event} allEvents={allEvents} onSelect={onSelect} onClose={onClose} />
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      <DetailBody event={event} allEvents={allEvents} onSelect={onSelect} onClose={onClose} />
    </div>
  )
}
