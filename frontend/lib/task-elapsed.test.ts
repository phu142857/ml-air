import { describe, expect, it } from "vitest";

import { computeTaskElapsedSeconds } from "./task-elapsed";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");

describe("computeTaskElapsedSeconds", () => {
  it("uses started_at to finished_at for terminal tasks", () => {
    expect(
      computeTaskElapsedSeconds({
        status: "SUCCESS",
        started_at: "2026-01-01T00:00:00.000Z",
        finished_at: "2026-01-01T00:01:30.000Z",
        duration_ms: 999_000,
      }),
    ).toBe(90);
  });

  it("falls back to duration_ms without finished_at", () => {
    expect(
      computeTaskElapsedSeconds({
        status: "SUCCESS",
        started_at: "2026-01-01T00:00:00.000Z",
        finished_at: null,
        duration_ms: 45_000,
      }),
    ).toBe(45);
  });

  it("ticks live for running tasks", () => {
    expect(
      computeTaskElapsedSeconds(
        {
          status: "RUNNING",
          started_at: "2026-01-01T00:00:00.000Z",
          finished_at: null,
          duration_ms: null,
        },
        T0 + 30_000,
      ),
    ).toBe(30);
  });
});
