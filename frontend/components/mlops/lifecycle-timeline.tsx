"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, ChevronDown, ChevronRight, Clock, ExternalLink } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { AuditEvent } from "@/lib/audit-event"
import { groupEventsByTimeline } from "@/lib/event-explorer"
import { actorInitials, actorRoleLabel, statusDisplayLabel } from "@/lib/event-sentence"
import {
  buildTimelineCardChips,
  resolveTimelineIcon,
  resolveTimelineIconKind,
  shortResourceLabel,
  timelineIconTone,
} from "@/lib/timeline-display"

/**
 * GitHub-style timeline:
 *   [●]── card (full column width)
 *    │
 *   [●]── card
 *
 * Grid: rail (28px) + content (1fr). Cards fill the left column.
 * Icon top aligns with card top; spine is continuous in the rail.
 */

const ICON = 28
const RAIL = 28

const STATUS_BADGE_CLASS: Record<string, string> = {
  Running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Queued: "border-border bg-muted text-muted-foreground",
  Completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Failed: "border-destructive/40 bg-destructive/10 text-destructive",
  Cancelled: "border-border bg-muted text-muted-foreground",
  Warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  Promoted: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Deleted: "border-border bg-muted text-muted-foreground",
  Archived: "border-border bg-muted text-muted-foreground",
  Info: "border-border bg-muted/40 text-muted-foreground",
  Skipped: "border-border bg-muted text-muted-foreground",
}

interface TimelineItemProps {
  event: AuditEvent
  isSelected: boolean
  isNew?: boolean
  isLast: boolean
  onSelect: (event: AuditEvent) => void
}

function TimelineItem({ event, isSelected, isNew, isLast, onSelect }: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = resolveTimelineIcon(event)
  const iconKind = resolveTimelineIconKind(event)
  const rel = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })
  const role = actorRoleLabel(event.actor.type, event.actor.name)
  const showRole =
    role.trim().length > 0 &&
    role.trim().toLowerCase() !== event.actor.name.trim().toLowerCase()
  const chips = buildTimelineCardChips(event)
  const spinIcon = iconKind === "run_running"
  const statusLabel = statusDisplayLabel(event)
  const targetLabel = shortResourceLabel(event)
  const hasExpandable =
    Boolean(event.metadata && Object.keys(event.metadata).length > 0) ||
    Boolean(event.traceId) ||
    chips.length > 0 ||
    Boolean(event.correlationId)

  return (
    <li
      className="relative grid items-start gap-x-3"
      style={{ gridTemplateColumns: `${RAIL}px minmax(0, 1fr)` }}
    >
      {/* Continuous vertical spine through icon center */}
      {!isLast ? (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-border"
          style={{ left: RAIL / 2 - 0.5 }}
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none absolute top-0 w-px bg-border"
          style={{ left: RAIL / 2 - 0.5, height: ICON / 2 + 2 }}
          aria-hidden
        />
      )}

      {/* Icon — top-aligned with card */}
      <div className="relative z-10 flex justify-center" style={{ height: ICON }}>
        <div
          className={cn(
            "flex items-center justify-center rounded-full border-2 bg-background",
            timelineIconTone(event),
          )}
          style={{ width: ICON, height: ICON }}
        >
          <Icon className={cn("size-3.5", spinIcon && "animate-spin")} aria-hidden />
        </div>
      </div>

      {/* Card — full remaining column width */}
      <div className="min-w-0 pb-6">
        <div
          className={cn(
            "w-full rounded-md border border-border bg-card text-left transition-colors duration-150",
            "hover:bg-muted/20",
            isSelected && "border-primary/40 bg-primary/[0.03]",
            isNew && "border-primary/30",
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(event)}
            className="w-full px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <Avatar className="size-6 border border-border/60">
                <AvatarFallback className="text-[10px]">
                  {actorInitials(event.actor.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                {event.actor.href ? (
                  <Link
                    href={event.actor.href}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-xs font-semibold text-foreground hover:underline"
                  >
                    {event.actor.name}
                  </Link>
                ) : (
                  <span className="truncate text-xs font-semibold text-foreground">
                    {event.actor.name}
                  </span>
                )}
                {showRole ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{role}</span>
                ) : null}
                {event.actor.type === "service_account" ? (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                    Service Account
                  </Badge>
                ) : null}
              </div>
              <time
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                dateTime={event.timestamp}
                title={new Date(event.timestamp).toLocaleString()}
              >
                {rel.replace(/^about /, "")}
              </time>
            </div>

            <div className="mt-1.5 flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium leading-snug text-foreground">
                {event.sentence}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 shrink-0 px-1.5 text-[10px] font-medium",
                  STATUS_BADGE_CLASS[statusLabel] ?? STATUS_BADGE_CLASS.Info,
                )}
              >
                {statusLabel}
              </Badge>
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {event.resource.href ? (
                <Link
                  href={event.resource.href}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 font-medium text-foreground/80 hover:text-primary hover:underline"
                >
                  {targetLabel}
                  <ExternalLink className="size-3 opacity-60" aria-hidden />
                </Link>
              ) : (
                <span className="font-medium text-foreground/70">{targetLabel}</span>
              )}
            </div>

            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {chips.map((c) => (
                  <span
                    key={`${c.label}-${c.value}`}
                    className="inline-flex max-w-full items-center rounded border border-border/50 bg-muted/25 px-1.5 py-px text-[10px] text-muted-foreground"
                  >
                    <span className="mr-1 font-medium text-muted-foreground/80">{c.label}</span>
                    <span className="truncate">{c.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </button>

          {hasExpandable ? (
            <div className="border-t border-border/60">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((v) => !v)
                }}
              >
                {expanded ? (
                  <ChevronDown className="size-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden />
                )}
                {expanded ? "Hide details" : "Show details"}
              </button>
              {expanded ? (
                <div className="space-y-3 border-t border-border/40 px-3 py-3 text-xs">
                  <dl className="grid gap-1.5 sm:grid-cols-2">
                    {event.projectId ? (
                      <MetaRow label="Project" value={event.projectId} />
                    ) : null}
                    {event.correlationId ? (
                      <MetaRow label="Correlation" value={event.correlationId} mono />
                    ) : null}
                    {event.traceId ? (
                      <MetaRow label="Trace" value={event.traceId} mono />
                    ) : null}
                    {event.source ? <MetaRow label="Source" value={event.source} /> : null}
                  </dl>
                  {event.metadata && Object.keys(event.metadata).length > 0 ? (
                    <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  ) : null}
                  {event.traceId ? (
                    <Link
                      href={`/traces?trace=${encodeURIComponent(event.traceId)}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open trace
                      <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</dt>
      <dd className={cn("truncate text-foreground/90", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  )
}

interface LifecycleTimelineProps {
  events: AuditEvent[]
  selectedId?: string | null
  newEventIds?: Set<string>
  onSelect: (event: AuditEvent) => void
  className?: string
}

export function LifecycleTimeline({
  events,
  selectedId,
  newEventIds,
  onSelect,
  className,
}: LifecycleTimelineProps) {
  const groups = groupEventsByTimeline(events)

  if (!events.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
        <Clock className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">No events match your filters</p>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full", className)}>
      {groups.map((group) => (
        <section key={group.label} className="mb-8 last:mb-0">
          <div
            className="mb-3 grid items-center gap-x-3"
            style={{ gridTemplateColumns: `${RAIL}px minmax(0, 1fr)` }}
          >
            <div aria-hidden />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
          </div>

          <ul className="list-none">
            {group.events.map((event, index) => (
              <TimelineItem
                key={event.id}
                event={event}
                isSelected={selectedId === event.id}
                isNew={newEventIds?.has(event.id)}
                isLast={index === group.events.length - 1}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function LifecycleTimelineEmpty({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-muted-foreground">
      <AlertTriangle className="mb-2 size-8 opacity-40" />
      <p className="text-sm">{message ?? "No timeline events yet"}</p>
    </div>
  )
}
