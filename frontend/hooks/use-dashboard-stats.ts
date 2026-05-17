"use client"

import { useQueries } from "@tanstack/react-query"
import { fetchDatasets, fetchModels, fetchPipelines, fetchRuns } from "@/lib/api"
import { useAppContext } from "@/lib/app-context"
import { mlairKeys } from "@/lib/query-keys"
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling"
import { isScopePinned } from "@/lib/scope"

export function useDashboardStats() {
  const { tenantId, projectId, token } = useAppContext()
  const isAggregate = !isScopePinned(tenantId, projectId)
  const enabled = Boolean(token?.trim())

  const poll = useRealtimeQueryPolling()
  const results = useQueries({
    queries: [
      {
        queryKey: mlairKeys.datasets.list(tenantId, projectId),
        queryFn: () => fetchDatasets(tenantId, projectId, token),
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.pipelines.list(tenantId, projectId),
        queryFn: () => fetchPipelines(tenantId, projectId, token),
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.runs.list(tenantId, projectId),
        queryFn: () => fetchRuns(tenantId, projectId, token),
        enabled,
        ...poll,
      },
      {
        queryKey: mlairKeys.models.list(tenantId, projectId),
        queryFn: () => fetchModels(tenantId, projectId, token),
        enabled,
        ...poll,
      },
    ],
  })

  const [datasetsQ, pipelinesQ, runsQ, modelsQ] = results
  const isLoading = results.some((r) => r.isLoading)

  const datasets = datasetsQ.data?.items ?? []
  const pipelines = pipelinesQ.data?.items ?? []
  const runs = runsQ.data?.items ?? []
  const models = modelsQ.data?.items ?? []

  const datasetsWithRows = datasets.filter((d) => (d.current_size ?? 0) > 0).length
  const runningPipelines = pipelines.filter((p) =>
    String(p.latest_status || "")
      .toUpperCase()
      .includes("RUN"),
  )
  const failedRuns = runs.filter((r) => String(r.status || "").toUpperCase() === "FAILED")
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
        href: "/datasets",
        color: "from-emerald-500 to-emerald-600",
      },
      {
        label: "Pipelines",
        value: pipelines.length,
        running: runningPipelines.length,
        href: "/pipelines",
        color: "from-amber-500 to-amber-600",
      },
      {
        label: "Recent Runs",
        value: runs.length,
        failed: failedRuns.length,
        href: "/runs",
        color: "from-sky-500 to-sky-600",
      },
      {
        label: "Models",
        value: models.length,
        registered: models.length,
        href: "/models",
        color: "from-violet-500 to-violet-600",
      },
    ],
    runningPipelines,
    failedRuns,
  }
}
