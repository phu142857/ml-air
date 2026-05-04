"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useAppContext } from "./app-context";

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
  payload?: { updated_at?: number; run_id?: string; status?: string };
};

function keysForEvent(
  tenantId: string,
  projectId: string,
  ev: Envelope
): readonly (readonly unknown[])[] {
  const t = ev.type;
  const rid = ev.resource_id ?? undefined;
  const runId = typeof ev.payload?.run_id === "string" ? ev.payload.run_id : undefined;

  if (t === "run.created" || t === "run.updated") {
    const keys: unknown[][] = [["runs", tenantId, projectId]];
    if (rid) {
      keys.push(["run", rid], ["run-tasks", rid], ["run-logs", rid], ["run-tracking", rid], ["run-readiness", rid]);
    }
    return keys;
  }
  if (t === "task.updated") {
    const r = runId || rid;
    const keys: unknown[][] = [["runs", tenantId, projectId]];
    if (r) {
      keys.push(["run-tasks", r], ["run", r], ["run-tracking", r], ["run-readiness", r]);
    }
    return keys;
  }
  if (t === "model.promoted") {
    const keys: unknown[][] = [["models", tenantId, projectId]];
    if (rid) {
      keys.push(
        ["model-versions", tenantId, projectId, rid],
        ["model-serving", tenantId, projectId, rid],
        ["model-status", tenantId, projectId, rid],
        ["model-recent-runs", tenantId, projectId, rid]
      );
    }
    return keys;
  }
  if (t === "dataset.updated") {
    const keys: unknown[][] = [["datasets", tenantId, projectId]];
    keys.push(["dataset-versions", tenantId, projectId]);
    if (rid) {
      keys.push(["dataset-versions", tenantId, projectId, rid]);
    }
    return keys;
  }
  return [];
}

/**
 * Single WebSocket subscriber: debounced TanStack invalidation from MLAir realtime events.
 */
export function useMlairRealtime() {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const seenIds = useRef<Set<string>>(new Set());
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

    const trimSeen = () => {
      if (seenIds.current.size <= MAX_SEEN_IDS) return;
      seenIds.current = new Set([...seenIds.current].slice(-Math.floor(MAX_SEEN_IDS / 2)));
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
        if (eid) {
          if (seenIds.current.has(eid)) return;
          seenIds.current.add(eid);
          trimSeen();
        }
        const ua = data.payload?.updated_at;
        const rk = `${data.type ?? ""}:${data.resource_id ?? ""}`;
        if (typeof ua === "number" && rk) {
          const prev = lastUpdated.current.get(rk);
          if (prev !== undefined && ua < prev) return;
          lastUpdated.current.set(rk, ua);
        }
        if (data.type === "ping" || (data as { type?: string }).type === "pong") return;
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
