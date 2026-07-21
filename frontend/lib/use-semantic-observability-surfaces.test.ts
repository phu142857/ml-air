import { describe, expect, it } from "vitest";

import {
  parseSemanticObservabilitySurfaces,
  shouldOpenLifecycleMetricsIndex,
} from "./use-semantic-observability-surfaces";

describe("parseSemanticObservabilitySurfaces", () => {
  it("returns empty for non-arrays", () => {
    expect(parseSemanticObservabilitySurfaces(undefined)).toEqual([]);
    expect(parseSemanticObservabilitySurfaces(null)).toEqual([]);
    expect(parseSemanticObservabilitySurfaces({})).toEqual([]);
    expect(parseSemanticObservabilitySurfaces("x")).toEqual([]);
  });

  it("passes through a valid surface list", () => {
    const rows = [
      {
        id: "readiness_gate",
        title: "Gate",
        metrics: [{ name: "mlair_readiness_blocked_total", kind: "counter", labels: ["path"] }],
      },
    ];
    expect(parseSemanticObservabilitySurfaces(rows)).toEqual(rows);
  });
});

describe("shouldOpenLifecycleMetricsIndex", () => {
  it("is false for empty or unknown", () => {
    expect(shouldOpenLifecycleMetricsIndex(null)).toBe(false);
    expect(shouldOpenLifecycleMetricsIndex("")).toBe(false);
    expect(shouldOpenLifecycleMetricsIndex("0")).toBe(false);
    expect(shouldOpenLifecycleMetricsIndex("maybe")).toBe(false);
  });

  it("is true for accepted tokens (case-insensitive)", () => {
    expect(shouldOpenLifecycleMetricsIndex("1")).toBe(true);
    expect(shouldOpenLifecycleMetricsIndex("OPEN")).toBe(true);
    expect(shouldOpenLifecycleMetricsIndex(" true ")).toBe(true);
    expect(shouldOpenLifecycleMetricsIndex("yes")).toBe(true);
  });
});
