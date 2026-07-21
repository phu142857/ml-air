"use client";

import { useQueries } from "@tanstack/react-query";
import {
  fetchAuditTimeline,
  fetchAuditTimelinePage,
  fetchDatasets,
  fetchDatasetsPage,
  fetchModels,
  fetchModelsPage,
  fetchPipelines,
  fetchPipelinesPage,
  fetchRuns,
  fetchRunsPage,
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const STATS_LIST_LIMIT = 100;
const BLOCKED_READINESS_LIMIT = 200;

export function useDashboardStats() {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const isAggregate = !scopePinned;
  const enabled = Boolean(token?.trim());

  const poll = useRealtimeQueryPolling();
  const results = useQueries({
    queries: [
      {
        queryKey: mlairKeys.datasets.list(tenantId, projectId),
        queryFn: async () => {
          if (scopePinned) {
            const page = await fetchDatasetsPage(tenantId, projectId, token, { limit: STATS_LIST_LIMIT });
            return { items: page.items };
          }
          return fetchDatasets(tenantId, projectId, token);
        },
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.pipelines.list(tenantId, projectId),
        queryFn: async () => {
          if (scopePinned) {
            const page = await fetchPipelinesPage(tenantId, projectId, token, { limit: STATS_LIST_LIMIT });
            return { items: page.items };
          }
          return fetchPipelines(tenantId, projectId, token);
        },
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.runs.list(tenantId, projectId),
        queryFn: async () => {
          if (scopePinned) {
            const page = await fetchRunsPage(tenantId, projectId, token, { limit: STATS_LIST_LIMIT });
            return { items: page.items };
          }
          return fetchRuns(tenantId, projectId, token);
        },
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.models.list(tenantId, projectId),
        queryFn: async () => {
          if (scopePinned) {
            const page = await fetchModelsPage(tenantId, projectId, token, { limit: STATS_LIST_LIMIT });
            return { items: page.items };
          }
          return fetchModels(tenantId, projectId, token);
        },
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.audit.timeline(tenantId, projectId, {
          readinessStatus: "blocked",
          kind: "dataset.readiness.evaluated",
        }),
        queryFn: async () => {
          const filters = {
            readinessStatus: "blocked",
            kind: "dataset.readiness.evaluated",
          };
          if (scopePinned) {
            const page = await fetchAuditTimelinePage(tenantId, projectId, token, {
              limit: BLOCKED_READINESS_LIMIT,
              filters,
            });
            return { items: page.items };
          }
          return fetchAuditTimeline(tenantId, projectId, token, {
            limit: BLOCKED_READINESS_LIMIT,
            filters,
          });
        },
        enabled: enabled && !isAggregate,
        ...poll,
      },
    ],
  });

  const [datasetsQ, pipelinesQ, runsQ, modelsQ, blockedReadinessQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  const datasets = datasetsQ.data?.items ?? [];
  const pipelines = pipelinesQ.data?.items ?? [];
  const runs = runsQ.data?.items ?? [];
  const models = modelsQ.data?.items ?? [];

  const datasetsWithRows = datasets.filter((d) => (d.current_size ?? 0) > 0).length;
  const blockedReadinessCount = blockedReadinessQ.data?.items?.length ?? 0;
  const runningPipelines = pipelines.filter((p) =>
    String(p.latest_status || "")
      .toUpperCase()
      .includes("RUN"),
  );
  const failedRuns = runs.filter((r) => String(r.status || "").toUpperCase() === "FAILED");
  return {
    isLoading,
    isAggregate,
    tenantId,
    projectId,
    datasets,
    pipelines,
    runs,
    models,
    stats: [
      {
        label: "Datasets",
        value: datasets.length,
        ready: datasetsWithRows,
        blocked: isAggregate ? undefined : blockedReadinessCount,
        href: "/datasets",
      },
      {
        label: "Pipelines",
        value: pipelines.length,
        running: runningPipelines.length,
        href: "/pipelines",
      },
      {
        label: "Recent Runs",
        value: runs.length,
        failed: failedRuns.length,
        href: "/runs",
      },
      {
        label: "Models",
        value: models.length,
        registered: models.length,
        href: "/models",
      },
    ],
    runningPipelines,
    failedRuns,
  };
}
