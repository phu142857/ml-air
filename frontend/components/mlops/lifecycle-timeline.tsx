"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Clock, ExternalLink } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { AuditEvent } from "@/lib/audit-event"
import { groupEventsByTimeline } from "@/lib/event-explorer"
import { actorInitials, actorRoleLabel, statusDisplayLabel } from "@/lib/event-sentence"
import { STATUS_CHIP_CLASS } from "@/lib/status-style"
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
 */

const ICON = 28
const RAIL = 28

function statusBadgeClass(label: string): string {
  switch (label) {
    case "Running":
      return STATUS_CHIP_CLASS.running
    case "Queued":
      return STATUS_CHIP_CLASS.pending
    case "Completed":
    case "Succeeded":
    case "Approved":
    case "Promoted":
      return STATUS_CHIP_CLASS.success
    case "Failed":
    case "Rejected":
      return STATUS_CHIP_CLASS.failed
    case "Warning":
      return STATUS_CHIP_CLASS.pending
    default:
      return STATUS_CHIP_CLASS.cancelled
  }
}

interface TimelineItemProps {
  event: AuditEvent
  isSelected: boolean
  isNew?: boolean
  isLast: boolean
  onSelect: (event: AuditEvent) => void
}

function TimelineItem({ event, isSelected, isNew, isLast, onSelect }: TimelineItemProps) {
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

  return (
    <li
      className="relative grid items-start gap-x-3"
      style={{ gridTemplateColumns: `${RAIL}px minmax(0, 1fr)` }}
    >
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

      <div className="min-w-0 pb-6">
        <div
          className={cn(
            "w-full rounded-md border border-border bg-card text-left outline-none transition-colors duration-150",
            "hover:bg-muted/40",
            isSelected && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20",
            isNew && "border-primary/30",
          )}
        >
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <Avatar className="size-6 border border-border/60">
              <AvatarFallback className="text-[11px]">{actorInitials(event.actor.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
              {event.actor.href ? (
                <Link href={event.actor.href} className="truncate text-xs font-semibold text-foreground link-primary">
                  {event.actor.name}
                </Link>
              ) : (
                <span className="truncate text-xs font-semibold text-foreground">{event.actor.name}</span>
              )}
              {showRole ? <span className="shrink-0 text-[11px] text-muted-foreground">{role}</span> : null}
              {event.actor.type === "service_account" ? (
                <Badge variant="outline" className="h-4 px-1 text-[11px] font-normal">
                  Service account
                </Badge>
              ) : null}
            </div>
            <time
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              dateTime={event.timestamp}
              title={new Date(event.timestamp).toLocaleString()}
            >
              {rel.replace(/^about /, "")}
            </time>
          </div>

          <button
            type="button"
            onClick={() => onSelect(event)}
            className="interactive-row w-full cursor-pointer px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium leading-snug text-foreground">{event.sentence}</p>
              <Badge
                variant="outline"
                className={cn("h-5 shrink-0 px-1.5 text-[11px] font-medium", statusBadgeClass(statusLabel))}
              >
                {statusLabel}
              </Badge>
            </div>
          </button>

          <div className="px-3 pb-2.5 text-xs text-muted-foreground">
            {event.resource.href ? (
              <Link
                href={event.resource.href}
                className="inline-flex items-center gap-1 font-medium text-foreground/80 link-primary"
              >
                {targetLabel}
                <ExternalLink className="size-3 opacity-60" aria-hidden />
              </Link>
            ) : (
              <span className="font-medium text-foreground/70">{targetLabel}</span>
            )}
            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {chips.map((c) => (
                  <span
                    key={`${c.label}-${c.value}`}
                    className="inline-flex max-w-full items-center rounded border border-border/50 bg-muted/25 px-1.5 py-px text-[11px] text-muted-foreground"
                  >
                    <span className="mr-1 font-medium text-muted-foreground/80">{c.label}</span>
                    <span className="truncate">{c.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
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
