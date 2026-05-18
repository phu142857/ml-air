"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchRunTasks, type TaskItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { useExecutionStore } from "@/lib/execution-store";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { useRunsListLive } from "@/hooks/use-runs-list-live";
import { isScopePinned } from "@/lib/scope";

export type TaskRow = TaskItem & { run_id: string; tenant_id: string; project_id: string };

/** Tasks tab: recent runs + task fan-out with WS patch, invalidation, and execution-store overlay. */
export function useTasksListLive(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();
  const tasksByRun = useExecutionStore((s) => s.tasksByRun);

  const runsQuery = useRunsListLive(enabled);

  const recentRuns = useMemo(() => {
    return runsQuery.items.slice(0, scopePinned ? 8 : 5);
  }, [runsQuery.items, scopePinned]);

  const runsFingerprint = useMemo(
    () => recentRuns.map((r) => `${r.tenant_id}:${r.project_id}:${r.run_id}`).join(","),
    [recentRuns],
  );

  const recentTasksQuery = useQuery({
    queryKey: mlairKeys.tasks.recent(tenantId, projectId, runsFingerprint),
    queryFn: async (): Promise<TaskRow[]> => {
      const batches = await Promise.all(
        recentRuns.map(async (run) => {
          const tid = run.tenant_id || tenantId;
          const pid = run.project_id || projectId;
          if (tid === "all" || pid === "all") return [];
          try {
            const data = await fetchRunTasks(tid, pid, run.run_id, token);
            return (data.items ?? []).map((t) => ({
              ...t,
              run_id: run.run_id,
              tenant_id: tid,
              project_id: pid,
            }));
          } catch {
            return [];
          }
        }),
      );
      return batches
        .flat()
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
        .slice(0, 28);
    },
    enabled: enabled && Boolean(token?.trim()) && recentRuns.length > 0,
    refetchOnMount: "always",
    ...poll,
  });

  const items = useMemo(() => {
    const base = recentTasksQuery.data ?? [];
    const byKey = new Map<string, TaskRow>();
    for (const row of base) {
      byKey.set(`${row.tenant_id}:${row.project_id}:${row.task_id}`, row);
    }
    for (const run of recentRuns) {
      const liveMap = tasksByRun[run.run_id];
      if (!liveMap) continue;
      const tid = run.tenant_id || tenantId;
      const pid = run.project_id || projectId;
      for (const live of Object.values(liveMap)) {
        if (!live?.task_id) continue;
        const key = `${tid}:${pid}:${live.task_id}`;
        const prev = byKey.get(key);
        if (prev) {
          byKey.set(key, {
            ...prev,
            ...live,
            run_id: run.run_id,
            tenant_id: tid,
            project_id: pid,
            status: live.status ?? prev.status,
            updated_at: live.updated_at ?? prev.updated_at,
            attempt: live.attempt ?? prev.attempt,
          });
        }
      }
    }
    return [...byKey.values()].sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
    );
  }, [recentTasksQuery.data, tasksByRun, recentRuns, tenantId, projectId]);

  return {
    ...recentTasksQuery,
    runsQuery,
    recentRuns,
    items,
    isLoading: runsQuery.isLoading || (recentRuns.length > 0 && recentTasksQuery.isLoading && items.length === 0),
    isFetching: runsQuery.isFetching || recentTasksQuery.isFetching,
  };
}
