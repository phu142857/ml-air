/**
 * Phase-1 execution realtime: pipeline scope invalidation + cache resolution.
 * Long-term: normalized execution store + event projection (see docs/guides/execution-realtime-architecture.md).
 */
import type { QueryClient } from "@tanstack/react-query";

import type { RunItem } from "./api";
import { mlairKeys } from "./query-keys";

export type ExecutionEventPayload = {
  updated_at?: number;
  run_id?: string;
  pipeline_id?: string;
  status?: string;
};

export type ExecutionEnvelope = {
  type?: string;
  resource_id?: string | null;
  payload?: ExecutionEventPayload;
};

/** Invalidate pipeline list + DAG when a run/task for that pipeline changes. */
export function keysPipelineExecutionSurface(
  tenantId: string,
  projectId: string,
  pipelineId: string,
): readonly (readonly unknown[])[] {
  const pid = pipelineId.trim();
  if (!pid) return [];
  return [
    [...mlairKeys.pipelines.list(tenantId, projectId)],
    [...mlairKeys.pipelines.topology(tenantId, projectId, pid)],
    [...mlairKeys.pipelines.dag(tenantId, projectId, pid)],
  ];
}

export function keysRunExecutionSurface(
  tenantId: string,
  projectId: string,
  runId: string,
): readonly (readonly unknown[])[] {
  const rid = runId.trim();
  if (!rid) return [];
  return [[...mlairKeys.run.executionGraph(tenantId, projectId, rid)]];
}

/** Resolve pipeline_id from WS payload or hydrated run detail cache. */
export function resolvePipelineIdFromExecutionEvent(
  queryClient: QueryClient,
  ev: ExecutionEnvelope,
): string | undefined {
  const fromPayload = String(ev.payload?.pipeline_id || "").trim();
  if (fromPayload) return fromPayload;

  const typ = ev.type;
  const runId =
    String(ev.payload?.run_id || "").trim() ||
    (typ === "run.updated" || typ === "run.created" ? String(ev.resource_id || "").trim() : "");

  if (!runId) return undefined;

  const run = queryClient.getQueryData<RunItem>(mlairKeys.run.detail(runId));
  const fromRun = String(run?.pipeline_id || "").trim();
  return fromRun || undefined;
}

export function appendPipelineExecutionKeys(
  keys: unknown[][],
  tenantId: string,
  projectId: string,
  pipelineId: string | undefined,
): void {
  if (!pipelineId) return;
  for (const k of keysPipelineExecutionSurface(tenantId, projectId, pipelineId)) {
    keys.push([...k]);
  }
}

export function appendRunExecutionKeys(
  keys: unknown[][],
  tenantId: string,
  projectId: string,
  runId: string | undefined,
): void {
  if (!runId) return;
  for (const k of keysRunExecutionSurface(tenantId, projectId, runId)) {
    keys.push([...k]);
  }
}
