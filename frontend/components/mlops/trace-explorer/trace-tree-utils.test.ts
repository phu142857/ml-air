import { describe, expect, it } from "vitest";

import type { TraceWaterfallStep } from "@/lib/api";

import {
  buildSpanBreadcrumb,
  buildTraceTreeIndex,
  collectDescendantIds,
  getAncestorChain,
  isRowVisible,
  truncateBreadcrumb,
} from "./trace-tree-utils";

function step(id: string, label: string, depth: number): TraceWaterfallStep {
  return {
    kind: "span",
    id,
    label,
    status: "ok",
    start_ts: null,
    end_ts: null,
    duration_ms: 1,
    depth,
    offset_ms: 0,
    width_ms: 1,
    end_offset_ms: 1,
  };
}

describe("trace-tree-utils", () => {
  const steps = [
    step("a", "Scheduler", 0),
    step("b", "Executor", 1),
    step("c", "Worker", 2),
    step("d", "Sibling", 1),
  ];

  it("builds parent-child relationships from depth", () => {
    const tree = buildTraceTreeIndex(steps);
    expect(tree.get("b")?.parentId).toBe("a");
    expect(tree.get("c")?.parentId).toBe("b");
    expect(tree.get("a")?.childIds).toEqual(["b", "d"]);
  });

  it("returns ancestor chain for breadcrumb", () => {
    const tree = buildTraceTreeIndex(steps);
    const chain = getAncestorChain(tree, "c");
    expect(chain.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("collects descendant ids for collapse", () => {
    const tree = buildTraceTreeIndex(steps);
    const hidden = collectDescendantIds(tree, "a");
    expect([...hidden]).toEqual(["b", "c", "d"]);
  });

  it("hides rows under collapsed ancestors", () => {
    const tree = buildTraceTreeIndex(steps);
    const collapsed = new Set(["b"]);
    expect(isRowVisible("c", collapsed, tree)).toBe(false);
    expect(isRowVisible("d", collapsed, tree)).toBe(true);
  });

  it("truncates long breadcrumb paths", () => {
    const longSteps = Array.from({ length: 8 }, (_, index) =>
      step(`s${index}`, `Span ${index}`, index),
    );
    const selected = longSteps[7]!;
    const segments = buildSpanBreadcrumb(longSteps, selected);
    expect(segments.some((segment) => segment.id === "__ellipsis__")).toBe(true);
    expect(segments.length).toBeLessThanOrEqual(5);
  });

  it("keeps short breadcrumb paths intact", () => {
    const selected = steps[2]!;
    const segments = truncateBreadcrumb(
      buildSpanBreadcrumb(steps, selected),
    );
    expect(segments.some((segment) => segment.id === "__ellipsis__")).toBe(false);
  });
});
