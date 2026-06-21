import { describe, expect, it } from "vitest";

import { reduceExecutionEnvelope } from "./execution-event-reducer";
import type { RunExecutionGraph } from "./execution-graph-types";

describe("reduceExecutionEnvelope", () => {
  it("updates run status when run.updated is newer", () => {
    const state = {
      runs: {
        "run-1": {
          run_id: "run-1",
          tenant_id: "t",
          project_id: "p",
          pipeline_id: "pipe-1",
          status: "PENDING",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
      tasksByRun: {},
      executionGraphs: {},
    };

    const next = reduceExecutionEnvelope(state, {
      type: "run.updated",
      resource_id: "run-1",
      payload: { status: "RUNNING", updated_at: 1_700_000_000 },
    });

    expect(next.runs["run-1"]?.status).toBe("RUNNING");
  });

  it("patches task status and matching execution graph node", () => {
    const graph: RunExecutionGraph = {
      run_id: "run-1",
      pipeline_id: "pipe-1",
      run_status: "RUNNING",
      nodes: [{ id: "task-a", label: "transform", status: "PENDING" }],
      edges: [],
    };

    const state = {
      runs: {},
      tasksByRun: {},
      executionGraphs: { "run-1": graph },
    };

    const next = reduceExecutionEnvelope(state, {
      type: "task.updated",
      resource_id: "run-1:task-a",
      payload: {
        run_id: "run-1",
        status: "SUCCESS",
        updated_at: 1_700_000_100,
      },
    });

    expect(next.tasksByRun["run-1"]?.["run-1:task-a"]?.status).toBe("SUCCESS");
    expect(next.executionGraphs["run-1"]?.nodes[0]?.status).toBe("SUCCESS");
  });

  it("ignores stale events by updated_at", () => {
    const state = {
      runs: {
        "run-1": {
          run_id: "run-1",
          tenant_id: "t",
          project_id: "p",
          pipeline_id: "pipe-1",
          status: "SUCCESS",
          updated_at: "2030-01-01T00:00:00.000Z",
        },
      },
      tasksByRun: {},
      executionGraphs: {},
    };

    const next = reduceExecutionEnvelope(state, {
      type: "run.updated",
      resource_id: "run-1",
      payload: { status: "RUNNING", updated_at: 1 },
    });

    expect(next).toBe(state);
  });

  it("updates run status for training.completed", () => {
    const state = {
      runs: {
        "run-1": {
          run_id: "run-1",
          tenant_id: "t",
          project_id: "p",
          pipeline_id: "pipe-1",
          status: "RUNNING",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
      tasksByRun: {},
      executionGraphs: {},
    };

    const next = reduceExecutionEnvelope(state, {
      type: "training.completed",
      resource_id: "run-1",
      payload: { status: "SUCCESS", updated_at: 1_700_000_000, pipeline_id: "pipe-1" },
    });

    expect(next.runs["run-1"]?.status).toBe("SUCCESS");
  });
});
