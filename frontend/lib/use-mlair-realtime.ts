"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  getRealtimeWsBase,
  type DatasetItem,
  type ModelItem,
  type PipelineItem,
  type RunItem,
  type TaskItem,
} from "./api";
import { useAppContext } from "./app-context";
import { useExecutionStore } from "./execution-store";
import {
  appendPipelineExecutionKeys,
  appendRunExecutionKeys,
  resolvePipelineIdFromExecutionEvent,
} from "./execution-realtime-sync";
import { fetchExecutionProjection, fetchSemanticEventReplay } from "./api";
import { getRuntimeConfig } from "./runtime-config";
import { isRealtimeConfigured } from "./realtime-url";
import { reconcileExecutionSnapshots } from "./execution-reconcile";
import {
  envelopeSequence,
  readLastSequence,
  writeLastSequence,
} from "./execution-sequence";
import { setMlairRealtimeUiStatus } from "./mlair-realtime-status";
import { mlairKeys } from "./query-keys";

const DEBOUNCE_MS = 300;
const RECONCILE_MS = 60_000;
const MAX_SEEN_IDS = 500;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

let pendingSerializedKeys: Set<string> = new Set();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const IMMEDIATE_INVALIDATE_KEY_HEADS = new Set([
  "runs",
  "run",
  "run-tasks",
  "run-logs",
  "run-tracking",
  "run-readiness",
  "run-execution-graph",
  "pipelines",
  "pipeline-topology",
  "pipeline-dag",
  "datasets",
  "models",
  "execution-projection",
  "tasks-recent",
]);

function isImmediateInvalidateKey(key: readonly unknown[]): boolean {
  return IMMEDIATE_INVALIDATE_KEY_HEADS.has(String(key[0] ?? ""));
}

function scheduleInvalidates(queryClient: QueryClient, keys: readonly (readonly unknown[])[]) {
  const debounced: (readonly unknown[])[] = [];
  for (const k of keys) {
    if (isImmediateInvalidateKey(k)) {
      queryClient.invalidateQueries({ queryKey: [...k], exact: false });
    } else {
      debounced.push(k);
    }
  }
  if (!debounced.length) return;
  for (const k of debounced) {
    pendingSerializedKeys.add(JSON.stringify(k));
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    for (const s of pendingSerializedKeys) {
      const key = JSON.parse(s) as unknown[];
      queryClient.invalidateQueries({ queryKey: key, exact: false });
    }
    pendingSerializedKeys.clear();
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

function buildWsUrl(base: string, tenantId: string, projectId: string, token: string): string {
  let root = base.trim();
  if (!root.startsWith("ws://") && !root.startsWith("wss://")) {
    root = `ws://${root}`;
  }
  root = root.replace(/\/+$/, "");
  if (!root.endsWith("/ws")) {
    root = `${root}/ws`;
  }
  const q = new URLSearchParams({
    tenant_id: tenantId,
    project_id: projectId,
    token
  });
  return `${root}?${q.toString()}`;
}

type Envelope = {
  version?: string;
  event_id?: string;
  sequence?: number;
  type?: string;
  resource_id?: string | null;
  payload?: {
    updated_at?: number;
    run_id?: string;
    dataset_id?: string;
    dataset_version_id?: string;
    pipeline_id?: string;
    blocked_by_gate?: boolean;
    policy_id?: string;
    status?: string;
    model_id?: string;
    version?: number;
    stage?: string;
    action?: string;
    approval_status?: string;
    kind?: string;
    ready?: boolean;
  };
};

/** Invalidate Dataset Hub queries (buffer, versions, readiness, policies, eligibility). */
function keysDatasetHubSurface(tenantId: string, projectId: string, datasetId: string): unknown[][] {
  return [
    [...mlairKeys.datasets.buffer(tenantId, projectId, datasetId)],
    [...mlairKeys.datasets.versions(tenantId, projectId, datasetId)],
    [...mlairKeys.datasets.detail(tenantId, projectId, datasetId)],
    [...mlairKeys.datasets.readiness(tenantId, projectId, datasetId, 0)],
    [...mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId)],
    [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId)],
    [...mlairKeys.datasets.trainingPolicies(tenantId, projectId, datasetId)],
    [...mlairKeys.datasetRuns(tenantId, projectId, datasetId)]
  ];
}

function keysForEvent(
  tenantId: string,
  projectId: string,
  ev: Envelope
): readonly (readonly unknown[])[] {
  const t = ev.type;
  const rid = ev.resource_id ?? undefined;
  const runId = typeof ev.payload?.run_id === "string" ? ev.payload.run_id : undefined;

  if (t === "run.created" || t === "run.updated") {
    const keys: unknown[][] = [
      [...mlairKeys.runs.list(tenantId, projectId)],
      [...mlairKeys.tasks.recentPrefix(tenantId, projectId)],
    ];
    if (rid) {
      keys.push(
        [...mlairKeys.run.detail(rid)],
        [...mlairKeys.run.tasks(rid)],
        [...mlairKeys.run.logs(rid)],
        [...mlairKeys.run.tracking(rid)],
        [...mlairKeys.run.readiness(rid)],
        [...mlairKeys.run.executionGraph(tenantId, projectId, rid)],
      );
    }
    return keys;
  }
  if (t === "run.tracking.updated") {
    const r = runId || rid;
    if (!r) return [];
    return [[...mlairKeys.run.tracking(r)]];
  }
  if (t === "task.updated") {
    const taskId = rid;
    const r = runId;
    const keys: unknown[][] = [
      [...mlairKeys.runs.list(tenantId, projectId)],
      [...mlairKeys.tasks.recentPrefix(tenantId, projectId)],
    ];
    if (taskId) {
      keys.push(["task", taskId]);
    }
    if (r) {
      keys.push(
        [...mlairKeys.run.tasks(r)],
        [...mlairKeys.run.detail(r)],
        [...mlairKeys.run.tracking(r)],
        [...mlairKeys.run.readiness(r)],
        [...mlairKeys.run.executionGraph(tenantId, projectId, r)],
      );
    }
    return keys;
  }
  if (t === "model.promoted") {
    const keys: unknown[][] = [[...mlairKeys.models.list(tenantId, projectId)], [...mlairKeys.audit.timeline(tenantId, projectId)]];
    if (rid) {
      keys.push(
        [...mlairKeys.models.versions(tenantId, projectId, rid)],
        [...mlairKeys.models.serving(tenantId, projectId, rid)],
        [...mlairKeys.models.status(tenantId, projectId, rid)],
        ["model-recent-runs", tenantId, projectId, rid]
      );
    }
    return keys;
  }
  if (t === "model.eligibility.updated") {
    const mid =
      (typeof ev.payload?.model_id === "string" ? ev.payload.model_id : undefined) ||
      (typeof rid === "string" ? rid : undefined);
    const keys: unknown[][] = [[...mlairKeys.models.list(tenantId, projectId)]];
    if (mid) {
      keys.push(
        [...mlairKeys.models.versions(tenantId, projectId, mid)],
        [...mlairKeys.models.serving(tenantId, projectId, mid)],
        [...mlairKeys.models.status(tenantId, projectId, mid)],
        [...mlairKeys.models.resolvedPipeline(tenantId, projectId, mid)],
        ["model-recent-runs", tenantId, projectId, mid]
      );
    }
    keys.push([...mlairKeys.datasets.trainingEligibilityProjectPrefix(tenantId, projectId)]);
    keys.push([...mlairKeys.audit.timeline(tenantId, projectId)]);
    return keys;
  }
  if (t === "dataset.updated") {
    const keys: unknown[][] = [[...mlairKeys.datasets.list(tenantId, projectId)]];
    if (rid) {
      keys.push(...keysDatasetHubSurface(tenantId, projectId, rid));
    }
    return keys;
  }
  if (t === "dataset.buffer.updated" || t === "dataset.version.created" || t === "buffer.threshold_met") {
    if (!rid) return [];
    return [...keysDatasetHubSurface(tenantId, projectId, rid), [...mlairKeys.audit.timeline(tenantId, projectId)]];
  }
  if (t === "dataset.readiness.updated") {
    if (!rid) return [];
    return [
      [...mlairKeys.datasets.readiness(tenantId, projectId, rid, 0)],
      [...mlairKeys.datasets.readinessEvaluations(tenantId, projectId, rid)],
      [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, rid)],
      [...mlairKeys.datasetRuns(tenantId, projectId, rid)],
      [...mlairKeys.audit.timeline(tenantId, projectId)]
    ];
  }
  if (t === "training.policy.updated") {
    const dsid =
      (typeof ev.payload?.dataset_id === "string" ? ev.payload.dataset_id : undefined) ||
      (typeof rid === "string" ? rid : undefined);
    if (!dsid) return [];
    return keysDatasetHubSurface(tenantId, projectId, dsid);
  }
  if (t === "training.eligibility.updated") {
    const keys: unknown[][] = [];
    const targetRunId = runId || rid;
    if (targetRunId) {
      keys.push([...mlairKeys.run.readiness(targetRunId)], [...mlairKeys.run.detail(targetRunId)]);
    }
    const dsid = typeof ev.payload?.dataset_id === "string" ? ev.payload.dataset_id : undefined;
    if (dsid) {
      keys.push(
        [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, dsid)],
        [...mlairKeys.datasetRuns(tenantId, projectId, dsid)]
      );
    }
    keys.push([...mlairKeys.audit.timeline(tenantId, projectId)]);
    return keys;
  }
  if (t === "eligibility.updated") {
    const kind = typeof ev.payload?.kind === "string" ? ev.payload.kind : "";
    if (kind === "training") {
      const keys: unknown[][] = [];
      const targetRunId = runId || rid;
      if (targetRunId) {
        keys.push([...mlairKeys.run.readiness(targetRunId)], [...mlairKeys.run.detail(targetRunId)]);
      }
      const dsid = typeof ev.payload?.dataset_id === "string" ? ev.payload.dataset_id : undefined;
      if (dsid) {
        keys.push(
          [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, dsid)],
          [...mlairKeys.datasetRuns(tenantId, projectId, dsid)]
        );
      }
      keys.push([...mlairKeys.audit.timeline(tenantId, projectId)]);
      return keys;
    }
    if (kind === "model") {
      const mid =
        (typeof ev.payload?.model_id === "string" ? ev.payload.model_id : undefined) ||
        (typeof rid === "string" ? rid : undefined);
      const keys: unknown[][] = [[...mlairKeys.models.list(tenantId, projectId)]];
      if (mid) {
        keys.push(
          [...mlairKeys.models.versions(tenantId, projectId, mid)],
          [...mlairKeys.models.serving(tenantId, projectId, mid)],
          [...mlairKeys.models.status(tenantId, projectId, mid)],
          [...mlairKeys.models.resolvedPipeline(tenantId, projectId, mid)],
          ["model-recent-runs", tenantId, projectId, mid]
        );
      }
      keys.push([...mlairKeys.datasets.trainingEligibilityProjectPrefix(tenantId, projectId)]);
      keys.push([...mlairKeys.audit.timeline(tenantId, projectId)]);
      return keys;
    }
    return [
      [...mlairKeys.datasets.trainingEligibilityProjectPrefix(tenantId, projectId)],
      [...mlairKeys.runs.list(tenantId, projectId)],
      [...mlairKeys.audit.timeline(tenantId, projectId)]
    ];
  }
  if (t === "training.triggered") {
    const keys: unknown[][] = [[...mlairKeys.runs.list(tenantId, projectId)], [...mlairKeys.audit.timeline(tenantId, projectId)]];
    const targetRunId = runId || rid;
    if (targetRunId) {
      keys.push(
        [...mlairKeys.run.detail(targetRunId)],
        [...mlairKeys.run.tasks(targetRunId)],
        [...mlairKeys.run.logs(targetRunId)],
        [...mlairKeys.run.tracking(targetRunId)],
        [...mlairKeys.run.readiness(targetRunId)]
      );
    }
    const dsid = typeof ev.payload?.dataset_id === "string" ? ev.payload.dataset_id : undefined;
    if (dsid) {
      keys.push(
        ...keysDatasetHubSurface(tenantId, projectId, dsid),
        [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, dsid)]
      );
    }
    const mid = typeof ev.payload?.model_id === "string" ? ev.payload.model_id : undefined;
    if (mid) {
      keys.push(
        [...mlairKeys.models.versions(tenantId, projectId, mid)],
        [...mlairKeys.models.status(tenantId, projectId, mid)],
        ["model-recent-runs", tenantId, projectId, mid]
      );
    }
    return keys;
  }
  if (t === "training.completed") {
    const keys: unknown[][] = [[...mlairKeys.runs.list(tenantId, projectId)], [...mlairKeys.audit.timeline(tenantId, projectId)]];
    const targetRunId = runId || rid;
    if (targetRunId) {
      keys.push(
        [...mlairKeys.run.detail(targetRunId)],
        [...mlairKeys.run.tasks(targetRunId)],
        [...mlairKeys.run.logs(targetRunId)],
        [...mlairKeys.run.tracking(targetRunId)],
        [...mlairKeys.run.readiness(targetRunId)]
      );
    }
    const dsid = typeof ev.payload?.dataset_id === "string" ? ev.payload.dataset_id : undefined;
    if (dsid) {
      keys.push(...keysDatasetHubSurface(tenantId, projectId, dsid));
    }
    const mid = typeof ev.payload?.model_id === "string" ? ev.payload.model_id : undefined;
    if (mid) {
      keys.push(
        [...mlairKeys.models.versions(tenantId, projectId, mid)],
        [...mlairKeys.models.status(tenantId, projectId, mid)],
        ["model-recent-runs", tenantId, projectId, mid]
      );
    }
    return keys;
  }
  return [];
}

const EXECUTION_SYNC_EVENT_TYPES = new Set([
  "run.created",
  "run.updated",
  "task.updated",
  "training.triggered",
  "training.completed",
]);

/** Merge pipeline list/DAG invalidation for execution lifecycle events. */
function keysForEventWithExecutionSurfaces(
  queryClient: QueryClient,
  tenantId: string,
  projectId: string,
  ev: Envelope,
): readonly (readonly unknown[])[] {
  const keys: unknown[][] = keysForEvent(tenantId, projectId, ev).map((k) => [...k]);
  if (!EXECUTION_SYNC_EVENT_TYPES.has(String(ev.type || ""))) {
    return keys;
  }
  const pipelineId =
    String(ev.payload?.pipeline_id || "").trim() || resolvePipelineIdFromExecutionEvent(queryClient, ev);
  appendPipelineExecutionKeys(keys, tenantId, projectId, pipelineId);
  const runId =
    String(ev.payload?.run_id || "").trim() ||
    (ev.type === "run.updated" || ev.type === "run.created" ? String(ev.resource_id || "").trim() : "");
  appendRunExecutionKeys(keys, tenantId, projectId, runId);
  return keys;
}

function isoFromUnix(ts: number): string {
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function updatedAtMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function envelopePayload(ev: Envelope): Envelope["payload"] & { updated_at: number } {
  const p = { ...(ev.payload ?? {}) };
  if (typeof p.updated_at !== "number") {
    p.updated_at = Math.floor(Date.now() / 1000);
  }
  return p as Envelope["payload"] & { updated_at: number };
}

function patchRunStatusCaches(
  queryClient: QueryClient,
  tenantId: string,
  projectId: string,
  runId: string,
  status: string,
  updatedAtUnix: number,
  allowCreateInList: boolean,
  pipelineId?: string,
) {
  const uaMs = updatedAtUnix * 1000;
  const iso = isoFromUnix(updatedAtUnix);

  queryClient.setQueryData<RunItem | undefined>(mlairKeys.run.detail(runId), (old) => {
    if (!old) return old;
    if (updatedAtMs(old.updated_at) > uaMs) return old;
    return { ...old, status, updated_at: iso };
  });

  queryClient.setQueryData<{ items: RunItem[] } | undefined>(
    mlairKeys.runs.list(tenantId, projectId),
    (old) => {
      const items = [...(old?.items ?? [])];
      const idx = items.findIndex((row) => row.run_id === runId);
      if (idx >= 0) {
        const row = items[idx]!;
        if (updatedAtMs(row.updated_at) <= uaMs) {
          items[idx] = { ...row, status, updated_at: iso };
        }
      } else if (allowCreateInList) {
        items.unshift({
          run_id: runId,
          tenant_id: tenantId,
          project_id: projectId,
          pipeline_id: pipelineId ?? "",
          status,
          updated_at: iso,
          created_at: iso,
        });
      }
      return { items };
    },
  );

  if (pipelineId) {
    queryClient.setQueryData<{ items: PipelineItem[] } | undefined>(
      mlairKeys.pipelines.list(tenantId, projectId),
      (old) => {
        if (!old?.items) return old;
        let changed = false;
        const items = old.items.map((row) => {
          if (row.pipeline_id !== pipelineId) return row;
          if (row.latest_run_id && row.latest_run_id !== runId && updatedAtMs(row.updated_at) > uaMs) {
            return row;
          }
          changed = true;
          return {
            ...row,
            latest_run_id: runId,
            latest_status: status,
            updated_at: iso,
          };
        });
        return changed ? { ...old, items } : old;
      },
    );
  }
}

function patchTaskStatusCaches(
  queryClient: QueryClient,
  taskId: string,
  runId: string,
  status: string,
  updatedAtUnix: number,
  tenantId: string,
  projectId: string,
) {
  const uaMs = updatedAtUnix * 1000;
  const iso = isoFromUnix(updatedAtUnix);

  queryClient.setQueriesData<
    { task_id?: string; status?: string; updated_at?: string } | undefined
  >({ queryKey: ["task", taskId] }, (old) => {
    if (!old || old.task_id !== taskId) return old;
    if (updatedAtMs(old.updated_at) > uaMs) return old;
    return { ...old, status, updated_at: iso };
  });

  queryClient.setQueryData<{ items: TaskItem[] } | undefined>(mlairKeys.run.tasks(runId), (old) => {
    if (!old?.items) return old;
    let changed = false;
    const items = old.items.map((task) => {
      if (task.task_id !== taskId) return task;
      if (updatedAtMs(task.updated_at) > uaMs) return task;
      changed = true;
      return { ...task, status, updated_at: iso };
    });
    return changed ? { ...old, items } : old;
  });

  type RecentTaskRow = TaskItem & { run_id: string; tenant_id: string; project_id: string };
  queryClient.setQueriesData<RecentTaskRow[]>(
    { queryKey: mlairKeys.tasks.recentPrefix(tenantId, projectId) },
    (old) => {
      if (!Array.isArray(old)) return old;
      let changed = false;
      const next = old.map((row) => {
        if (row.task_id !== taskId || row.run_id !== runId) return row;
        if (updatedAtMs(row.updated_at) > uaMs) return row;
        changed = true;
        return { ...row, status, updated_at: iso };
      });
      return changed ? next : old;
    },
  );
}

/** v1.5: merge hot fields into cached run/task queries when payload is sufficient (startUpForRTS §10). */
function applyRealtimePatch(queryClient: QueryClient, tenantId: string, projectId: string, ev: Envelope) {
  const p = envelopePayload(ev);
  const uaMs = p.updated_at * 1000;
  const typ = ev.type;
  const rid = typeof ev.resource_id === "string" ? ev.resource_id : undefined;
  const runFromPayload = typeof p.run_id === "string" ? p.run_id : undefined;

  if ((typ === "run.updated" || typ === "run.created") && rid && typeof p.status === "string") {
    patchRunStatusCaches(
      queryClient,
      tenantId,
      projectId,
      rid,
      p.status,
      p.updated_at,
      typ === "run.created",
      String(p.pipeline_id || "").trim() || undefined,
    );
  }

  if (typ === "training.completed" && rid && typeof p.status === "string") {
    patchRunStatusCaches(
      queryClient,
      tenantId,
      projectId,
      rid,
      p.status,
      p.updated_at,
      false,
      String(p.pipeline_id || "").trim() || undefined,
    );
  }

  if (typ === "training.triggered" && rid && typeof p.status === "string") {
    patchRunStatusCaches(
      queryClient,
      tenantId,
      projectId,
      rid,
      p.status,
      p.updated_at,
      true,
      String(p.pipeline_id || "").trim() || undefined,
    );
  }

  if (typ === "task.updated" && runFromPayload && rid && typeof p.status === "string") {
    patchTaskStatusCaches(queryClient, rid, runFromPayload, p.status, p.updated_at, tenantId, projectId);
  }

  if (typ === "model.promoted") {
    const mid = typeof p.model_id === "string" ? p.model_id : rid;
    if (!mid) return;
    const iso = isoFromUnix(p.updated_at);
    queryClient.setQueryData<{ items: ModelItem[] } | undefined>(
      mlairKeys.models.list(tenantId, projectId),
      (old) => {
      if (!old?.items) return old;
      let changed = false;
      const items = old.items.map((row) => {
        if (row.model_id !== mid) return row;
        if (updatedAtMs(row.updated_at) > uaMs) return row;
        changed = true;
        return { ...row, updated_at: iso };
      });
      return changed ? { ...old, items } : old;
    }
    );
  }

  if (typ === "dataset.updated" && rid) {
    const iso = isoFromUnix(p.updated_at);
    queryClient.setQueryData<{ items: DatasetItem[] } | undefined>(
      mlairKeys.datasets.list(tenantId, projectId),
      (old) => {
      if (!old?.items) return old;
      let changed = false;
      const items = old.items.map((row) => {
        if (row.dataset_id !== rid) return row;
        const prev = row.updated_at ? updatedAtMs(row.updated_at) : 0;
        if (prev > uaMs) return row;
        changed = true;
        return { ...row, updated_at: iso };
      });
      return changed ? { ...old, items } : old;
    }
    );
  }
}

/**
 * Single WebSocket subscriber: debounced TanStack invalidation from MLAir realtime events.
 */
export function useMlairRealtime() {
  const { tenantId, projectId, token, isBootstrapped } = useAppContext();
  const queryClient = useQueryClient();
  const seenOrder = useRef<string[]>([]);
  const seenSet = useRef<Set<string>>(new Set());
  const lastUpdated = useRef<Map<string, number>>(new Map());
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const shouldHaltRef = useRef(false);
  const lastSequenceRef = useRef(0);
  const reconcileTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWsBaseRef = useRef("");

  useEffect(() => {
    if (tenantId === "all" || projectId === "all") {
      setMlairRealtimeUiStatus({ kind: "inactive" });
      return () => {
        setMlairRealtimeUiStatus({ kind: "inactive" });
      };
    }

    if (!isBootstrapped || !token?.trim()) {
      setMlairRealtimeUiStatus({ kind: "polling" });
      return () => {
        setMlairRealtimeUiStatus({ kind: "polling" });
      };
    }
    useExecutionStore.getState().setScope(`${tenantId}::${projectId}`);
    lastSequenceRef.current = readLastSequence(tenantId, projectId);

    const rememberEventId = (id: string): boolean => {
      if (seenSet.current.has(id)) return false;
      seenSet.current.add(id);
      seenOrder.current.push(id);
      while (seenOrder.current.length > MAX_SEEN_IDS) {
        const drop = seenOrder.current.shift();
        if (drop) seenSet.current.delete(drop);
      }
      return true;
    };

    const bumpSequence = (ev: Envelope) => {
      const seq = envelopeSequence(ev);
      if (seq == null) return;
      if (seq > lastSequenceRef.current) {
        lastSequenceRef.current = seq;
        writeLastSequence(tenantId, projectId, seq);
      }
    };

    const processEnvelope = (data: Envelope, opts?: { fromReplay?: boolean }) => {
      if (data.version !== "v1") return;
      const seq = envelopeSequence(data);
      if (seq != null && seq <= lastSequenceRef.current && !opts?.fromReplay) return;

      const eid = data.event_id;
      if (eid && !rememberEventId(eid)) return;

      const normalized: Envelope = {
        ...data,
        payload: envelopePayload(data),
      };

      const ua = normalized.payload?.updated_at;
      const rk = `${normalized.type ?? ""}:${normalized.resource_id ?? ""}`;
      let stalePatch = false;
      if (typeof ua === "number" && rk) {
        const prev = lastUpdated.current.get(rk);
        if (prev !== undefined && ua < prev) stalePatch = true;
        else lastUpdated.current.set(rk, ua);
      }

      if (normalized.type === "ping" || (normalized as { type?: string }).type === "pong") return;

      if (!stalePatch) {
        applyRealtimePatch(queryClient, tenantId, projectId, normalized);
      }
      useExecutionStore.getState().applyEnvelope(normalized);

      const keys = keysForEventWithExecutionSurfaces(queryClient, tenantId, projectId, normalized);
      if (keys.length) scheduleInvalidates(queryClient, keys);
      bumpSequence(normalized);
    };

    const replayMissedEvents = async () => {
      if (!token?.trim()) return;
      try {
        const { items, last_sequence: lastSeq } = await fetchSemanticEventReplay(
          tenantId,
          projectId,
          token,
          lastSequenceRef.current,
        );
        for (const ev of items) {
          processEnvelope(ev as Envelope, { fromReplay: true });
        }
        if (typeof lastSeq === "number" && lastSeq > lastSequenceRef.current) {
          lastSequenceRef.current = lastSeq;
          writeLastSequence(tenantId, projectId, lastSeq);
        }
        reconcileExecutionSnapshots(queryClient, tenantId, projectId);
        if (getRuntimeConfig()?.features?.execution_projection) {
          try {
            const projection = await fetchExecutionProjection(tenantId, projectId, token);
            useExecutionStore.getState().hydrateFromProjection(projection);
          } catch {
            /* projection is optional */
          }
        }
      } catch {
        /* replay is best-effort; WS stream + periodic reconcile still apply */
      }
    };

    const reconcileWithProjection = () => {
      reconcileExecutionSnapshots(queryClient, tenantId, projectId);
      if (!getRuntimeConfig()?.features?.execution_projection || !token?.trim()) return;
      void fetchExecutionProjection(tenantId, projectId, token)
        .then((projection) => useExecutionStore.getState().hydrateFromProjection(projection))
        .catch(() => undefined);
    };

    const startReconcileTimer = () => {
      if (reconcileTimerRef.current) return;
      reconcileTimerRef.current = setInterval(() => {
        reconcileWithProjection();
      }, RECONCILE_MS);
    };

    const stopReconcileTimer = () => {
      if (reconcileTimerRef.current) {
        clearInterval(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
    };

    const abortPendingConnection = () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      const ws = wsRef.current;
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      wsRef.current = null;
    };

    const scheduleReconnect = () => {
      if (shouldHaltRef.current) return;
      if (reconnectTimer.current) return;
      setMlairRealtimeUiStatus({ kind: "reconnecting" });
      const delay = backoffRef.current + Math.floor(Math.random() * 400);
      backoffRef.current = Math.min(MAX_BACKOFF_MS, Math.floor(backoffRef.current * 1.7));
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, delay);
    };

    shouldHaltRef.current = false;

    const connect = () => {
      if (shouldHaltRef.current) return;
      if (!token?.trim()) {
        setMlairRealtimeUiStatus({ kind: "polling" });
        return;
      }
      const base = getRealtimeWsBase();
      if (!isRealtimeConfigured() || !base) {
        setMlairRealtimeUiStatus({ kind: "polling" });
        return;
      }
      abortPendingConnection();
      setMlairRealtimeUiStatus({ kind: "connecting" });
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      const url = buildWsUrl(base, tenantId, projectId, token);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      connectTimeoutRef.current = setTimeout(() => {
        connectTimeoutRef.current = null;
        if (wsRef.current !== ws || ws.readyState !== WebSocket.CONNECTING) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
        scheduleReconnect();
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        backoffRef.current = BASE_BACKOFF_MS;
        lastWsBaseRef.current = base;
        setMlairRealtimeUiStatus({ kind: "connected" });
        void replayMissedEvents();
        startReconcileTimer();
      };

      ws.onmessage = (evt) => {
        let data: Envelope;
        try {
          data = JSON.parse(String(evt.data)) as Envelope;
        } catch {
          return;
        }
        processEnvelope(data);
      };

      ws.onerror = () => {
        /* onclose will reconnect */
      };

      ws.onclose = (ev) => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        if (wsRef.current === ws) wsRef.current = null;
        stopReconcileTimer();
        if (shouldHaltRef.current) return;
        const fatalPolicy = ev.code === 1008;
        if (fatalPolicy) {
          shouldHaltRef.current = true;
          setMlairRealtimeUiStatus({ kind: "fatal", code: ev.code });
          return;
        }
        scheduleReconnect();
      };
    };

    const onRuntimeConfig = () => {
      const base = getRealtimeWsBase();
      if (
        base === lastWsBaseRef.current &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        return;
      }
      backoffRef.current = BASE_BACKOFF_MS;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      abortPendingConnection();
      connect();
    };

    window.addEventListener("mlair-runtime-config-updated", onRuntimeConfig);

    connect();

    return () => {
      shouldHaltRef.current = true;
      stopReconcileTimer();
      window.removeEventListener("mlair-runtime-config-updated", onRuntimeConfig);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      abortPendingConnection();
      setMlairRealtimeUiStatus({ kind: "polling" });
    };
  }, [tenantId, projectId, token, isBootstrapped, queryClient]);
}
