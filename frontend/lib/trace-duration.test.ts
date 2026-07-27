import { describe, expect, it } from "vitest";

import {
  buildTraceDurationContext,
  computeTraceSearchDurationMs,
  computeWaterfallStepDurationMs,
} from "./trace-duration";
import type { TraceDetailResponse, TraceWaterfallStep } from "./api";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");

function step(partial: Partial<TraceWaterfallStep> & Pick<TraceWaterfallStep, "kind" | "id">): TraceWaterfallStep {
  return {
    label: partial.label ?? partial.id,
    status: partial.status ?? "SUCCESS",
    start_ts: partial.start_ts ?? null,
    end_ts: partial.end_ts ?? null,
    duration_ms: partial.duration_ms ?? null,
    offset_ms: partial.offset_ms ?? 0,
    width_ms: partial.width_ms ?? 0,
    end_offset_ms: partial.end_offset_ms ?? 0,
    is_instant: partial.is_instant ?? false,
    ...partial,
  };
}

describe("computeWaterfallStepDurationMs", () => {
  it("aligns run step with run wall-clock helper", () => {
    const detail = {
      is_live: false,
      primary_run_id: "run-1",
      runs: [
        {
          run_id: "run-1",
          pipeline_id: "pipe",
          status: "SUCCESS",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:03:00.000Z",
        },
      ],
      waterfall: {
        run_id: "run-1",
        anchor_ts: "2026-01-01T00:00:00.000Z",
        total_ms: 600_000,
        steps: [
          step({
            kind: "task",
            id: "task-a",
            status: "SUCCESS",
            start_ts: "2026-01-01T00:00:00.000Z",
            end_ts: "2026-01-01T00:10:00.000Z",
          }),
        ],
      },
    } as TraceDetailResponse;

    const ctx = buildTraceDurationContext(detail, T0);
    const ms = computeWaterfallStepDurationMs(
      step({
        kind: "run",
        id: "run-1",
        status: "SUCCESS",
        start_ts: "2026-01-01T00:00:00.000Z",
        end_ts: "2026-01-01T00:03:00.000Z",
      }),
      ctx,
    );
    expect(ms).toBe(600_000);
  });

  it("uses task elapsed helper for task steps", () => {
    const ctx = buildTraceDurationContext(null, T0);
    const ms = computeWaterfallStepDurationMs(
      step({
        kind: "task",
        id: "task-a",
        status: "SUCCESS",
        start_ts: "2026-01-01T00:00:00.000Z",
        end_ts: "2026-01-01T00:01:30.000Z",
        duration_ms: 999_000,
      }),
      ctx,
    );
    expect(ms).toBe(90_000);
  });
});

describe("computeTraceSearchDurationMs", () => {
  it("prefers wall clock from start_ts and last_seen", () => {
    expect(
      computeTraceSearchDurationMs({
        start_ts: "2026-01-01T00:00:00.000Z",
        last_seen: "2026-01-01T00:02:00.000Z",
        duration_ms: 999_000,
      }),
    ).toBe(120_000);
  });

  it("ticks live traces from start_ts", () => {
    expect(
      computeTraceSearchDurationMs(
        {
          start_ts: "2026-01-01T00:00:00.000Z",
          last_seen: "2026-01-01T00:00:30.000Z",
          duration_ms: 30_000,
        },
        { nowMs: T0 + 45_000, isLive: true },
      ),
    ).toBe(45_000);
  });
});
