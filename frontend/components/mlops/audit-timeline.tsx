"use client"

import { useState } from "react"
import { 
  ChevronDown, 
  ChevronRight, 
  User, 
  Bot, 
  Clock, 
  Database, 
  GitBranch, 
  Box, 
  Play, 
  AlertCircle,
  HelpCircle // Icon dự phòng
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./status-badge"
import { JaegerLink } from "./jaeger-link"
import type { AuditEvent } from "@/lib/audit-event"
import { formatDateTimeCompact, formatRelativeTime } from "@/lib/utils"

interface AuditTimelineProps {
  events: AuditEvent[]
  newEventIds?: Set<string>
}

// Mapping Icons
const eventTypeIcons: Record<string, React.ElementType> = {
  run: Play,
  dataset: Database,
  model: Box,
  pipeline: GitBranch,
  system: AlertCircle,
}

// Mapping Colors
const eventTypeColors: Record<string, string> = {
  run: "text-primary bg-primary/10",
  dataset: "text-[color:var(--status-success-fg)] bg-[color:var(--status-success-bg)]",
  model: "text-primary bg-primary/10",
  pipeline: "text-[color:var(--status-pending-fg)] bg-[color:var(--status-pending-bg)]",
  system: "text-[color:var(--status-failed-fg)] bg-[color:var(--status-failed-bg)]",
}

function ActorBadge({ actor }: { actor: AuditEvent["actor"] }) {
  const isUser = actor.type === "user"
  
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {isUser ? (
        <User className="h-3 w-3 text-muted-foreground" />
      ) : (
        <Bot className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={cn(
        "font-medium",
        isUser ? "text-foreground/90" : "text-muted-foreground"
      )}>
        {actor.name}
      </span>
    </span>
  )
}

interface AuditTimelineItemProps {
  event: AuditEvent
  isLast: boolean
  isNew?: boolean
}

function AuditTimelineItem({ event, isLast, isNew }: AuditTimelineItemProps) {
  const [expanded, setExpanded] = useState(false)
  
  // FIX: Thêm Fallback Icon và Color để tránh lỗi 'undefined' khi gặp eventType lạ
  const Icon = eventTypeIcons[event.eventType] || HelpCircle
  const iconColor = eventTypeColors[event.eventType] || "text-muted-foreground bg-muted"
  
  const statusMap: Record<string, "success" | "failed" | "running" | "pending"> = {
    success: "success",
    failed: "failed",
    blocked: "failed",
    eligible: "success",
    ready: "success",
    running: "running",
    pending: "pending",
  }

  return (
    <div className={cn(
      "relative flex gap-4 pb-6 last:pb-0",
      isNew && "rounded-lg ring-1 ring-primary/25 bg-primary/[0.04] animate-highlight-pulse"
    )}>
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-px bg-muted" />
      )}
      
      {/* Event icon */}
      <div className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background",
        iconColor
      )}>
        <Icon className="h-4 w-4" />
      </div>
      
      {/* Event content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "panel-surface transition-all duration-200",
            expanded && "border-border bg-card shadow-lg shadow-black/20"
          )}
        >
          {/* Header Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {event.title}
                </h3>
                <StatusBadge status={statusMap[event.status] || "pending"} size="sm" />
                {event.severity !== "info" && (
                  <span className={cn(
                    "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                    event.severity === "warning" && "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
                    event.severity === "error" && "bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
                    event.severity === "critical" && "bg-red-500/20 text-red-300"
                  )}>
                    {event.severity}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {event.description}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">
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
          
          {/* Expanded content */}
          {expanded && (
            <div className="border-t border-border p-4 space-y-4 animate-in zoom-in-95 duration-200">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Description</label>
                <p className="text-sm text-foreground/90 mt-1">{event.description}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Actor</label>
                  <div className="mt-1">
                    <ActorBadge actor={event.actor} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Event Type</label>
                  <p className="text-sm text-foreground/90 mt-1 capitalize">{event.eventType}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Exact Timestamp</label>
                  <p className="text-sm font-mono text-muted-foreground mt-1">
                    {new Date(event.timestamp).toISOString()}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Event ID</label>
                  <p className="text-sm font-mono text-muted-foreground mt-1">{event.id}</p>
                </div>
              </div>
              
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Metadata</label>
                  <pre className="mt-1 text-xs font-mono text-muted-foreground bg-background/50 border border-border rounded-md p-3 overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {event.traceId && (
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground/80 tracking-wider">Trace ID</label>
                    <p className="text-sm font-mono text-muted-foreground mt-0.5">{event.traceId}</p>
                  </div>
                  <JaegerLink traceId={event.traceId} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AuditTimeline({ events, newEventIds }: AuditTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl surface-muted">
        <div className="h-12 w-12 rounded-full bg-card flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No events found</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-[200px]">
          Audit events will appear here as the system processes tasks
        </p>
      </div>
    )
  }

  return (
    <div className="relative px-1">
      {events.map((event, index) => (
        <AuditTimelineItem
          key={event.id}
          event={event}
          isLast={index === events.length - 1}
          isNew={newEventIds?.has(event.id)}
        />
      ))}
    </div>
  )
}