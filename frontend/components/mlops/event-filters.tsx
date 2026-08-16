"use client"

import type { CSSProperties } from "react"
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
import type { ActorType } from "@/lib/audit-event"
import type { EventResult } from "@/lib/event-explorer"

export type EventType = "all" | "run" | "dataset" | "model" | "pipeline" | "system"
export type Severity = "all" | "info" | "warning" | "error" | "critical"
export type TimeRange = "1h" | "24h" | "7d" | "30d" | "all"
export type ActorTypeFilter = ActorType | "all"

interface EventFiltersProps {
  eventType: EventType
  severity: Severity
  timeRange: TimeRange
  actorType: ActorTypeFilter
  targetType: string
  result: EventResult
  onEventTypeChange: (value: EventType) => void
  onSeverityChange: (value: Severity) => void
  onTimeRangeChange: (value: TimeRange) => void
  onActorTypeChange: (value: ActorTypeFilter) => void
  onTargetTypeChange: (value: string) => void
  onResultChange: (value: EventResult) => void
  activeFilters: number
  onClearFilters: () => void
}

type FilterOption<T extends string = string> = { value: T; label: string }

const EVENT_TYPE_OPTIONS: FilterOption<EventType>[] = [
  { value: "all", label: "All categories" },
  { value: "run", label: "Run" },
  { value: "dataset", label: "Dataset" },
  { value: "model", label: "Model" },
  { value: "pipeline", label: "Pipeline" },
  { value: "system", label: "System" },
]

const ACTOR_TYPE_OPTIONS: FilterOption<ActorTypeFilter>[] = [
  { value: "all", label: "All actors" },
  { value: "user", label: "User" },
  { value: "service_account", label: "Service account" },
  { value: "scheduler", label: "Scheduler" },
  { value: "worker", label: "Worker" },
  { value: "plugin", label: "Plugin" },
  { value: "system", label: "System" },
]

const TARGET_TYPE_OPTIONS: FilterOption[] = [
  { value: "all", label: "All resources" },
  { value: "dataset", label: "Dataset" },
  { value: "model", label: "Model" },
  { value: "pipeline", label: "Pipeline" },
  { value: "run", label: "Run" },
  { value: "task", label: "Task" },
  { value: "prompt", label: "Prompt" },
  { value: "cluster", label: "Cluster" },
]

const RESULT_OPTIONS: FilterOption<EventResult>[] = [
  { value: "all", label: "All statuses" },
  { value: "success", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "pending", label: "Queued" },
  { value: "cancelled", label: "Cancelled" },
]

const SEVERITY_OPTIONS: FilterOption<Severity>[] = [
  { value: "all", label: "All Severities" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "critical", label: "Critical" },
]

const TIME_RANGE_OPTIONS: FilterOption<TimeRange>[] = [
  { value: "1h", label: "Last Hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "all", label: "All Time" },
]

/** Min width in `ch` so trigger fits the longest option label (+ chevron). */
function minWidthCh(labels: string[]): CSSProperties {
  const longest = Math.max(...labels.map((l) => l.length), 0)
  return { minWidth: `${longest + 3.5}ch` }
}

const TRIGGER_CLASS = "h-8 w-fit border-border bg-card text-xs"

interface FilterSelectProps<T extends string> {
  value: T
  options: FilterOption<T>[]
  onValueChange: (value: T) => void
  placeholder: string
}

function FilterSelect<T extends string>({
  value,
  options,
  onValueChange,
  placeholder,
}: FilterSelectProps<T>) {
  const widthStyle = minWidthCh(options.map((o) => o.label))

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
      <SelectTrigger className={TRIGGER_CLASS} style={widthStyle}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function EventFilters({
  eventType,
  severity,
  timeRange,
  actorType,
  targetType,
  result,
  onEventTypeChange,
  onSeverityChange,
  onTimeRangeChange,
  onActorTypeChange,
  onTargetTypeChange,
  onResultChange,
  activeFilters,
  onClearFilters,
}: EventFiltersProps) {
  const targetValue = targetType || "all"
  const targetWidthStyle = minWidthCh(TARGET_TYPE_OPTIONS.map((o) => o.label))

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filters</span>
        {activeFilters > 0 ? (
          <Badge variant="secondary" className="h-5 border-primary/20 bg-primary/10 px-1.5 text-xs text-primary">
            {activeFilters}
          </Badge>
        ) : null}
      </div>

      <FilterSelect
        value={eventType}
        options={EVENT_TYPE_OPTIONS}
        onValueChange={onEventTypeChange}
        placeholder="Category"
      />

      <FilterSelect
        value={actorType}
        options={ACTOR_TYPE_OPTIONS}
        onValueChange={onActorTypeChange}
        placeholder="Actor"
      />

      <Select
        value={targetValue}
        onValueChange={(v) => onTargetTypeChange(v === "all" ? "" : v)}
      >
        <SelectTrigger className={TRIGGER_CLASS} style={targetWidthStyle}>
          <SelectValue placeholder="Resource" />
        </SelectTrigger>
        <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
          {TARGET_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FilterSelect
        value={result}
        options={RESULT_OPTIONS}
        onValueChange={onResultChange}
        placeholder="Status"
      />

      <FilterSelect
        value={severity}
        options={SEVERITY_OPTIONS}
        onValueChange={onSeverityChange}
        placeholder="Severity"
      />

      <FilterSelect
        value={timeRange}
        options={TIME_RANGE_OPTIONS}
        onValueChange={onTimeRangeChange}
        placeholder="Time range"
      />

      {activeFilters > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 text-xs text-muted-foreground hover:text-foreground pressable"
        >
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
