import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { RunItem } from "./api";
import {
  keysPipelineExecutionSurface,
  resolvePipelineIdFromExecutionEvent,
} from "./execution-realtime-sync";
import { mlairKeys } from "./query-keys";

describe("execution-realtime-sync", () => {
  it("keysPipelineExecutionSurface returns list, topology, and dag keys", () => {
    const keys = keysPipelineExecutionSurface("t1", "p1", "pipe-1");
    expect(keys).toEqual([
      ["pipelines", "t1", "p1"],
      ["pipeline-topology", "t1", "p1", "pipe-1"],
      ["pipeline-dag", "t1", "p1", "pipe-1"],
    ]);
  });

  it("resolvePipelineIdFromExecutionEvent prefers payload then run cache", () => {
    const qc = new QueryClient();
    qc.setQueryData<RunItem>(mlairKeys.run.detail("run-1"), {
      run_id: "run-1",
      tenant_id: "t1",
      project_id: "p1",
      pipeline_id: "from-cache",
      status: "RUNNING",
    });

    expect(
      resolvePipelineIdFromExecutionEvent(qc, {
        type: "task.updated",
        resource_id: "task-1",
        payload: { run_id: "run-1", status: "RUNNING" },
      }),
    ).toBe("from-cache");

    expect(
      resolvePipelineIdFromExecutionEvent(qc, {
        type: "task.updated",
        resource_id: "task-1",
        payload: { run_id: "run-1", pipeline_id: "from-payload", status: "RUNNING" },
      }),
    ).toBe("from-payload");
  });
});
