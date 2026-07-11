import { describe, expect, it } from "vitest";

import type { TraceDetailResponse, TraceWaterfallStep } from "@/lib/api";

import { buildSpanTimelineRows } from "./trace-span-events";

const baseStep = (overrides: Partial<TraceWaterfallStep> = {}): TraceWaterfallStep => ({
  kind: "span",
  id: "span-1",
  label: "predict",
  status: "success",
  start_ts: "2026-01-01T00:00:00Z",
  end_ts: "2026-01-01T00:00:01Z",
  duration_ms: 1000,
  offset_ms: 0,
  width_ms: 1000,
  end_offset_ms: 1000,
  task_id: "task-1",
  run_id: "run-1",
  ...overrides,
});

const baseData = (): TraceDetailResponse => ({
  trace_id: "trace-1",
  runs: [],
  events: [
    {
      event_id: "ev-1",
      type: "task.started",
      ts: "2026-01-01T00:00:00Z",
      task_id: "task-1",
      status: "running",
      payload: {},
    },
    {
      event_id: "ev-2",
      type: "run.finished",
      ts: "2026-01-01T00:00:02Z",
      run_id: "run-9",
      status: "success",
      payload: {},
    },
  ],
  audit_events: [
    {
      ts: "2026-01-01T00:00:00Z",
      kind: "status_change",
      resource_type: "task",
      resource_id: "task-1",
      source: "mlair",
      payload: { status: "running" },
    },
  ],
  logs: [],
  waterfall: null,
  otel_trace: null,
  unified_waterfall: null,
  is_live: false,
  primary_run_id: "run-1",
  event_count: 2,
  run_count: 1,
  audit_count: 1,
  log_count: 0,
  otel_span_count: 0,
  unified_step_count: 1,
});

describe("buildSpanTimelineRows", () => {
  it("returns semantic and audit events linked to the span task", () => {
    const rows = buildSpanTimelineRows(baseData(), baseStep());
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(["ev-1", "status_change-task-1-0"]);
  });

  it("matches run-level events for run spans", () => {
    const data = baseData();
    data.events.push({
      event_id: "ev-run",
      type: "run.started",
      ts: "2026-01-01T00:00:00Z",
      run_id: "run-1",
      status: "running",
      payload: {},
    });

    const rows = buildSpanTimelineRows(
      data,
      baseStep({ kind: "run", id: "run-1", task_id: null }),
    );
    expect(rows.some((row) => row.id === "ev-run")).toBe(true);
  });
});
