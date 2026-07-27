import { describe, expect, it } from "vitest";

import { computeRunWallDurationSeconds } from "./run-duration";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");

describe("computeRunWallDurationSeconds", () => {
  it("ticks live for active runs", () => {
    const seconds = computeRunWallDurationSeconds(
      {
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:05:00.000Z",
        status: "RUNNING",
      },
      [],
      T0 + 120_000,
    );
    expect(seconds).toBe(120);
  });

  it("uses max task finished_at for completed runs", () => {
    const seconds = computeRunWallDurationSeconds(
      {
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:03:00.000Z",
        status: "SUCCESS",
      },
      [
        { finished_at: "2026-01-01T00:08:00.000Z", status: "SUCCESS" },
        { finished_at: "2026-01-01T00:10:00.000Z", status: "SUCCESS" },
      ],
      T0,
    );
    expect(seconds).toBe(600);
  });

  it("falls back to updated_at when no tasks", () => {
    const seconds = computeRunWallDurationSeconds(
      {
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:02:30.000Z",
        status: "SUCCESS",
      },
      undefined,
      T0,
    );
    expect(seconds).toBe(150);
  });
});
