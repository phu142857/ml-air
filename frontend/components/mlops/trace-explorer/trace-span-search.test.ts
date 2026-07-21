import { describe, expect, it } from "vitest";

import type { TraceWaterfallStep } from "@/lib/api";

import { buildSpanSearchMatchSet, scoreSpanSearch, searchSpans } from "./trace-span-search";

function step(partial: Partial<TraceWaterfallStep> & Pick<TraceWaterfallStep, "id" | "label">): TraceWaterfallStep {
  return {
    kind: "span",
    status: "ok",
    start_ts: null,
    end_ts: null,
    duration_ms: 1,
    offset_ms: 0,
    width_ms: 1,
    end_offset_ms: 1,
    ...partial,
  };
}

describe("trace-span-search", () => {
  const steps = [
    step({ id: "1", label: "Scheduler", service: "orchestrator", status: "SUCCESS" }),
    step({
      id: "2",
      label: "Worker",
      service: "gpu",
      status: "FAILED",
      attributes: { model_id: "yolo-v8", batch: 32 },
    }),
    step({ id: "3", label: "Cleanup", service: "orchestrator", status: "running" }),
  ];

  it("matches label, service, status, and attributes", () => {
    expect(scoreSpanSearch(steps[0]!, "sched")?.fields).toContain("label");
    expect(scoreSpanSearch(steps[0]!, "orchestrator")?.fields).toContain("service");
    expect(scoreSpanSearch(steps[1]!, "failed")?.fields).toContain("status");
    expect(scoreSpanSearch(steps[1]!, "yolo-v8")?.fields).toContain("attribute");
    expect(scoreSpanSearch(steps[1]!, "model_id")?.fields).toContain("attribute");
  });

  it("returns ordered visible matches by row order", () => {
    const { orderedMatchIds } = buildSpanSearchMatchSet(steps, "orchestrator");
    expect(orderedMatchIds).toEqual(["1", "3"]);
  });

  it("returns empty results for blank query", () => {
    expect(searchSpans(steps, "   ")).toEqual([]);
  });
});
