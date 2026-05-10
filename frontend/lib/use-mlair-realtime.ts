"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { DatasetItem, ModelItem, RunItem, TaskItem } from "./api";
import { useAppContext } from "./app-context";
import { mlairKeys } from "./query-keys";

const DEBOUNCE_MS = 300;
const MAX_SEEN_IDS = 500;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 30_000;

let pendingSerializedKeys: Set<string> = new Set();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInvalidates(queryClient: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const k of keys) {
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
  type?: string;
  resource_id?: string | null;
  payload?: {
    updated_at?: number;
    run_id?: string;
    dataset_id?: string;
    policy_id?: string;
    status?: string;
    model_id?: string;
    version?: number;
    stage?: string;
    action?: string;
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
    const keys: unknown[][] = [[...mlairKeys.runs.list(tenantId, projectId)]];
    if (rid) {
      keys.push(
        [...mlairKeys.run.detail(rid)],
        [...mlairKeys.run.tasks(rid)],
        [...mlairKeys.run.logs(rid)],
        [...mlairKeys.run.tracking(rid)],
        [...mlairKeys.run.readiness(rid)]
      );
    }
    return keys;
  }
  if (t === "task.updated") {
    const r = runId || rid;
    const keys: unknown[][] = [[...mlairKeys.runs.list(tenantId, projectId)]];
    if (r) {
      keys.push(
        [...mlairKeys.run.tasks(r)],
        [...mlairKeys.run.detail(r)],
        [...mlairKeys.run.tracking(r)],
        [...mlairKeys.run.readiness(r)]
      );
    }
    return keys;
  }
  if (t === "model.promoted") {
    const keys: unknown[][] = [[...mlairKeys.models.list(tenantId, projectId)]];
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
  if (t === "dataset.updated") {
    const keys: unknown[][] = [[...mlairKeys.datasets.list(tenantId, projectId)]];
    if (rid) {
      keys.push(...keysDatasetHubSurface(tenantId, projectId, rid));
    }
    return keys;
  }
  if (t === "dataset.buffer.updated" || t === "dataset.version.created") {
    if (!rid) return [];
    return keysDatasetHubSurface(tenantId, projectId, rid);
  }
  if (t === "dataset.readiness.updated") {
    if (!rid) return [];
    return [
      [...mlairKeys.datasets.readiness(tenantId, projectId, rid, 0)],
      [...mlairKeys.datasets.readinessEvaluations(tenantId, projectId, rid)],
      [...mlairKeys.datasets.trainingEligibility(tenantId, projectId, rid)],
      [...mlairKeys.datasetRuns(tenantId, projectId, rid)]
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
    return keys;
  }
  return [];
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

/** v1.5: merge hot fields into cached run/task queries when payload is sufficient (startUpForRTS §10). */
function applyRealtimePatch(queryClient: QueryClient, tenantId: string, projectId: string, ev: Envelope) {
  const p = ev.payload;
  if (!p || typeof p.updated_at !== "number") return;
  const uaMs = p.updated_at * 1000;
  const typ = ev.type;
  const rid = typeof ev.resource_id === "string" ? ev.resource_id : undefined;
  const runFromPayload = typeof p.run_id === "string" ? p.run_id : undefined;

  if ((typ === "run.updated" || typ === "run.created") && rid && typeof p.status === "string") {
    const status = p.status;
    const iso = isoFromUnix(p.updated_at);
    queryClient.setQueryData<RunItem | undefined>(mlairKeys.run.detail(rid), (old) => {
      if (!old) return old;
      if (updatedAtMs(old.updated_at) > uaMs) return old;
      return { ...old, status, updated_at: iso };
    });
    queryClient.setQueryData<{ items: RunItem[] } | undefined>(mlairKeys.runs.list(tenantId, projectId), (old) => {
      if (!old?.items) return old;
      let changed = false;
      const items = old.items.map((row) => {
        if (row.run_id !== rid) return row;
        if (updatedAtMs(row.updated_at) > uaMs) return row;
        changed = true;
        return { ...row, status, updated_at: iso };
      });
      return changed ? { ...old, items } : old;
    });
  }

  if (typ === "task.updated" && runFromPayload && rid && typeof p.status === "string") {
    const status = p.status;
    const iso = isoFromUnix(p.updated_at);
    queryClient.setQueryData<{ items: TaskItem[] } | undefined>(mlairKeys.run.tasks(runFromPayload), (old) => {
      if (!old?.items) return old;
      let changed = false;
      const items = old.items.map((task) => {
        if (task.task_id !== rid) return task;
        if (updatedAtMs(task.updated_at) > uaMs) return task;
        changed = true;
        return { ...task, status, updated_at: iso };
      });
      return changed ? { ...old, items } : old;
    });
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
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const seenOrder = useRef<string[]>([]);
  const seenSet = useRef<Set<string>>(new Set());
  const lastUpdated = useRef<Map<string, number>>(new Map());
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const shouldHaltRef = useRef(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS?.trim();
    if (!base) return;
    if (tenantId === "all" || projectId === "all") return;

    shouldHaltRef.current = false;

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

    const connect = () => {
      if (shouldHaltRef.current) return;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      const url = buildWsUrl(base, tenantId, projectId, token);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = BASE_BACKOFF_MS;
      };

      ws.onmessage = (evt) => {
        let data: Envelope;
        try {
          data = JSON.parse(String(evt.data)) as Envelope;
        } catch {
          return;
        }
        if (data.version !== "v1") return;
        const eid = data.event_id;
        if (eid && !rememberEventId(eid)) return;
        const ua = data.payload?.updated_at;
        const rk = `${data.type ?? ""}:${data.resource_id ?? ""}`;
        if (typeof ua === "number" && rk) {
          const prev = lastUpdated.current.get(rk);
          if (prev !== undefined && ua < prev) return;
          lastUpdated.current.set(rk, ua);
        }
        if (data.type === "ping" || (data as { type?: string }).type === "pong") return;
        applyRealtimePatch(queryClient, tenantId, projectId, data);
        const keys = keysForEvent(tenantId, projectId, data);
        if (keys.length) scheduleInvalidates(queryClient, keys);
      };

      ws.onerror = () => {
        /* onclose will reconnect */
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        if (shouldHaltRef.current) return;
        const fatalPolicy = ev.code === 1008;
        if (fatalPolicy) {
          shouldHaltRef.current = true;
          return;
        }
        const delay =
          backoffRef.current + Math.floor(Math.random() * 400);
        backoffRef.current = Math.min(MAX_BACKOFF_MS, Math.floor(backoffRef.current * 1.7));
        reconnectTimer.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      shouldHaltRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [tenantId, projectId, token, queryClient]);
}
