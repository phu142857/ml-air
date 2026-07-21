import { describe, expect, it } from "vitest";

import type { RunItem } from "./api";
import { mergeRunListRow } from "./execution-live-merge";

function run(partial: Partial<RunItem> & Pick<RunItem, "run_id" | "status">): RunItem {
  return {
    tenant_id: "t1",
    project_id: "p1",
    pipeline_id: "pipe-1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeRunListRow", () => {
  it("keeps fresher API row when store still has RUNNING", () => {
    const queryRow = run({
      run_id: "r1",
      status: "SUCCESS",
      updated_at: "2026-06-02T12:00:05.000Z",
    });
    const live = run({
      run_id: "r1",
      status: "RUNNING",
      updated_at: "2026-06-02T12:00:01.000Z",
    });
    expect(mergeRunListRow(queryRow, live).status).toBe("SUCCESS");
  });

  it("applies newer store row when WS arrives before list refetch", () => {
    const queryRow = run({
      run_id: "r1",
      status: "RUNNING",
      updated_at: "2026-06-02T12:00:01.000Z",
    });
    const live = run({
      run_id: "r1",
      status: "SUCCESS",
      updated_at: "2026-06-02T12:00:05.000Z",
    });
    expect(mergeRunListRow(queryRow, live).status).toBe("SUCCESS");
  });
});
