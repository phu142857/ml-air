import { describe, expect, it } from "vitest";

import { mergeTaskStatusesIntoGraph } from "./merge-execution-graph-tasks";
import { taskMatchesNode, taskNodeId } from "./execution-task-keys";

describe("execution-task-keys", () => {
  it("matches config node id to scoped task_id", () => {
    expect(taskMatchesNode("train", "run-abc:train", "run-abc")).toBe(true);
    expect(taskMatchesNode("train", "train", "run-abc")).toBe(true);
    expect(taskMatchesNode("train", "run-abc:eval", "run-abc")).toBe(false);
  });

  it("taskNodeId strips run prefix", () => {
    expect(taskNodeId("run-1:task-a", "run-1")).toBe("task-a");
  });

  it("mergeTaskStatusesIntoGraph applies task status to nodes", () => {
    const merged = mergeTaskStatusesIntoGraph(
      {
        pipeline_id: "p1",
        run_id: "run-1",
        nodes: [{ id: "task-a", label: "task-a", status: "PENDING" }],
        edges: [],
      },
      [{ task_id: "run-1:task-a", status: "RUNNING", attempt: 1 }],
      "run-1",
    );
    expect(merged.nodes[0]?.status).toBe("RUNNING");
  });
});
