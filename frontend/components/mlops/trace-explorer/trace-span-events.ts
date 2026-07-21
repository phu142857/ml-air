import type { TraceWaterfallStep } from "@/lib/api";

import {
  buildTraceTimelineRows,
  type TimelineRow,
} from "@/components/mlops/trace-explorer/trace-secondary-panels";

function readPayloadId(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function semanticEventMatchesSpan(row: TimelineRow, step: TraceWaterfallStep): boolean {
  if (row.source !== "semantic") return false;
  const ev = row.row;

  if (step.kind === "run" && ev.run_id === step.id) return true;
  if (step.kind === "task" && ev.task_id === step.id) return true;
  if (step.run_id && ev.run_id === step.run_id) return true;
  if (step.task_id && ev.task_id === step.task_id) return true;

  const spanId = step.span_id ?? (step.kind === "span" ? step.id : null);
  if (spanId) {
    const payloadSpan = readPayloadId(ev.payload, ["span_id", "spanId"]);
    if (payloadSpan === spanId) return true;
  }

  return false;
}

function auditEventMatchesSpan(row: TimelineRow, step: TraceWaterfallStep): boolean {
  if (row.source !== "audit") return false;
  const ev = row.row;
  const resourceType = ev.resource_type.toLowerCase();

  if (step.kind === "run" && resourceType === "run" && ev.resource_id === step.id) return true;
  if (step.kind === "task" && resourceType === "task" && ev.resource_id === step.id) return true;
  if (step.run_id && ev.resource_id === step.run_id) return true;
  if (step.task_id && ev.resource_id === step.task_id) return true;

  const spanId = step.span_id ?? (step.kind === "span" ? step.id : null);
  if (spanId) {
    const payloadSpan = readPayloadId(ev.payload, ["span_id", "spanId"]);
    if (payloadSpan === spanId) return true;
  }

  return false;
}

export function filterSpanTimelineRows(
  rows: TimelineRow[],
  step: TraceWaterfallStep,
): TimelineRow[] {
  return rows.filter(
    (row) => semanticEventMatchesSpan(row, step) || auditEventMatchesSpan(row, step),
  );
}

export function buildSpanTimelineRows(
  data: Parameters<typeof buildTraceTimelineRows>[0],
  step: TraceWaterfallStep,
): TimelineRow[] {
  return filterSpanTimelineRows(buildTraceTimelineRows(data), step);
}
