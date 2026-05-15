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
  run: "text-sky-400 bg-sky-500/10",
  dataset: "text-emerald-400 bg-emerald-500/10",
  model: "text-violet-400 bg-violet-500/10",
  pipeline: "text-amber-400 bg-amber-500/10",
  system: "text-red-400 bg-red-500/10",
}

function ActorBadge({ actor }: { actor: AuditEvent["actor"] }) {
  const isUser = actor.type === "user"
  
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {isUser ? (
        <User className="h-3 w-3 text-zinc-500" />
      ) : (
        <Bot className="h-3 w-3 text-zinc-500" />
      )}
      <span className={cn(
        "font-medium",
        isUser ? "text-zinc-300" : "text-zinc-500"
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
  const iconColor = eventTypeColors[event.eventType] || "text-zinc-400 bg-zinc-500/10"
  
  const statusMap: Record<string, "success" | "failed" | "running" | "pending"> = {
    success: "success",
    failed: "failed",
    running: "running",
    pending: "pending",
  }

  return (
    <div className={cn(
      "relative flex gap-4 pb-6 last:pb-0",
      isNew && "animate-in fade-in slide-in-from-left-2 duration-500"
    )}>
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-px bg-zinc-800" />
      )}
      
      {/* Event icon */}
      <div className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950",
        iconColor
      )}>
        <Icon className="h-4 w-4" />
      </div>
      
      {/* Event content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-lg border border-zinc-800 bg-zinc-900/50 transition-all duration-200",
            expanded && "border-zinc-700 bg-zinc-900 shadow-lg shadow-black/20"
          )}
        >
          {/* Header Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-start gap-3 p-3 text-left hover:bg-zinc-800/30 transition-colors rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-medium text-zinc-100 truncate">
                  {event.title}
                </h3>
                <StatusBadge status={statusMap[event.status] || "pending"} size="sm" />
                {event.severity !== "info" && (
                  <span className={cn(
                    "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                    event.severity === "warning" && "bg-amber-500/10 text-amber-400",
                    event.severity === "error" && "bg-red-500/10 text-red-400",
                    event.severity === "critical" && "bg-red-500/20 text-red-300"
                  )}>
                    {event.severity}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 line-clamp-1">
                {event.description}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-mono text-zinc-500">
                  {formatDateTimeCompact(event.timestamp)}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              )}
            </div>
          </button>
          
          {/* Expanded content */}
          {expanded && (
            <div className="border-t border-zinc-800 p-4 space-y-4 animate-in zoom-in-95 duration-200">
              <div>
                <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Description</label>
                <p className="text-sm text-zinc-300 mt-1">{event.description}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Actor</label>
                  <div className="mt-1">
                    <ActorBadge actor={event.actor} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Event Type</label>
                  <p className="text-sm text-zinc-300 mt-1 capitalize">{event.eventType}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Exact Timestamp</label>
                  <p className="text-sm font-mono text-zinc-400 mt-1">
                    {new Date(event.timestamp).toISOString()}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Event ID</label>
                  <p className="text-sm font-mono text-zinc-500 mt-1">{event.id}</p>
                </div>
              </div>
              
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Metadata</label>
                  <pre className="mt-1 text-xs font-mono text-zinc-400 bg-zinc-950/50 border border-zinc-800 rounded-md p-3 overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {event.traceId && (
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Trace ID</label>
                    <p className="text-sm font-mono text-zinc-500 mt-0.5">{event.traceId}</p>
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
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
        <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-zinc-700" />
        </div>
        <p className="text-sm font-medium text-zinc-400">No events found</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-[200px]">
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