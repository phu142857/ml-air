"use client"

import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export type EventType = "all" | "run" | "dataset" | "model" | "pipeline" | "system"
export type Severity = "all" | "info" | "warning" | "error" | "critical"
export type TimeRange = "1h" | "24h" | "7d" | "30d" | "all"

interface EventFiltersProps {
  eventType: EventType
  severity: Severity
  timeRange: TimeRange
  onEventTypeChange: (value: EventType) => void
  onSeverityChange: (value: Severity) => void
  onTimeRangeChange: (value: TimeRange) => void
  activeFilters: number
  onClearFilters: () => void
}

export function EventFilters({
  eventType,
  severity,
  timeRange,
  onEventTypeChange,
  onSeverityChange,
  onTimeRangeChange,
  activeFilters,
  onClearFilters,
}: EventFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filters</span>
        {activeFilters > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-sky-500/10 text-sky-400 border-sky-500/20">
            {activeFilters}
          </Badge>
        )}
      </div>

      <Select value={eventType} onValueChange={(v) => onEventTypeChange(v as EventType)}>
        <SelectTrigger className="w-[140px] h-8 text-xs bg-card border-border">
          <SelectValue placeholder="Event Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="run">Run</SelectItem>
          <SelectItem value="dataset">Dataset</SelectItem>
          <SelectItem value="model">Model</SelectItem>
          <SelectItem value="pipeline">Pipeline</SelectItem>
          <SelectItem value="system">System</SelectItem>
        </SelectContent>
      </Select>

      <Select value={severity} onValueChange={(v) => onSeverityChange(v as Severity)}>
        <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Severities</SelectItem>
          <SelectItem value="info">Info</SelectItem>
          <SelectItem value="warning">Warning</SelectItem>
          <SelectItem value="error">Error</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
        </SelectContent>
      </Select>

      <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
        <SelectTrigger className="w-[120px] h-8 text-xs bg-card border-border">
          <SelectValue placeholder="Time Range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1h">Last Hour</SelectItem>
          <SelectItem value="24h">Last 24h</SelectItem>
          <SelectItem value="7d">Last 7 Days</SelectItem>
          <SelectItem value="30d">Last 30 Days</SelectItem>
          <SelectItem value="all">All Time</SelectItem>
        </SelectContent>
      </Select>

      {activeFilters > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
