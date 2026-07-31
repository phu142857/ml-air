"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Network, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResourcePageHeader, ScopePinnedInline, MlopsEmptyState } from "@/components/mlops/layout"
import {
  LineageGraph,
  LineageLegend,
  inferDatasetKind,
  taskDisplayName,
  type LineageGraphEdge,
  type LineageGraphNode,
} from "@/components/mlops/lineage-graph"
import { formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { SCOPE_AGGREGATE_LINEAGE } from "@/lib/scope-messages"
import {
  fetchDatasetVersions,
  fetchLineageForRun,
  fetchLineageNeighborhood,
  type DatasetVersionItem,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"

function dvId(versionId: string) {
  return `dv:${versionId}`
}

function taskNodeId(taskId: string) {
  return `task:${taskId}`
}

function versionMeta(
  versionId: string,
  versions: DatasetVersionItem[] | undefined,
): { name: string; version?: string } {
  const row = versions?.find((v) => v.version_id === versionId)
  if (row) {
    const name = String(row.dataset_name || row.dataset_id || versionId).trim() || versionId
    return { name, version: row.version || undefined }
  }
  const short = versionId.length > 18 ? `${versionId.slice(0, 16)}…` : versionId
  return { name: short }
}

function buildFromRunLineage(
  edges: Array<{
    edge_id: string
    task_id: string
    input_version_id: string | null
    output_version_id: string | null
    input_dataset_name?: string | null
    output_dataset_name?: string | null
    input_version?: string | null
    output_version?: string | null
  }>,
  versions: DatasetVersionItem[] | undefined,
): { nodes: LineageGraphNode[]; edges: LineageGraphEdge[] } {
  const nodeMap = new Map<string, LineageGraphNode>()
  const rfEdges: LineageGraphEdge[] = []
  const seen = new Set<string>()

  const addDv = (vid: string | null, name: string | null | undefined, ver: string | null | undefined) => {
    if (!vid) return
    const id = dvId(vid)
    if (nodeMap.has(id)) return
    const meta = versionMeta(vid, versions)
    const displayName = name?.trim() || meta.name
    nodeMap.set(id, {
      id,
      kind: inferDatasetKind(displayName),
      label: displayName,
      subtitle: ver?.trim() || meta.version,
      detail: vid,
    })
  }

  for (const e of edges) {
    addDv(e.input_version_id, e.input_dataset_name, e.input_version)
    addDv(e.output_version_id, e.output_dataset_name, e.output_version)
    const tid = taskNodeId(e.task_id)
    if (!nodeMap.has(tid)) {
      const { label, detail } = taskDisplayName(e.task_id)
      nodeMap.set(tid, {
        id: tid,
        kind: "task",
        label,
        subtitle: "operator",
        detail,
      })
    }
    if (e.input_version_id) {
      const key = `${e.edge_id}-in`
      if (!seen.has(key)) {
        seen.add(key)
        rfEdges.push({ id: key, source: dvId(e.input_version_id), target: tid, label: "reads" })
      }
    }
    if (e.output_version_id) {
      const key = `${e.edge_id}-out`
      if (!seen.has(key)) {
        seen.add(key)
        rfEdges.push({ id: key, source: tid, target: dvId(e.output_version_id), label: "writes" })
      }
    }
  }

  return { nodes: [...nodeMap.values()], edges: rfEdges }
}

function buildFromNeighborhood(
  edges: Array<{
    edge_id: string
    run_id: string
    task_id: string
    input_dataset_version_id: string | null
    output_dataset_version_id: string | null
  }>,
  versions: DatasetVersionItem[] | undefined,
): { nodes: LineageGraphNode[]; edges: LineageGraphEdge[] } {
  const mapped = edges.map((e) => ({
    edge_id: e.edge_id,
    task_id: e.task_id,
    input_version_id: e.input_dataset_version_id,
    output_version_id: e.output_dataset_version_id,
    input_dataset_name: null as string | null,
    output_dataset_name: null as string | null,
    input_version: null as string | null,
    output_version: null as string | null,
  }))
  return buildFromRunLineage(mapped, versions)
}

function pickLatestVersionId(items: DatasetVersionItem[]): string | null {
  if (!items.length) return null
  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(String(a.created_at || "")) || 0
    const tb = Date.parse(String(b.created_at || "")) || 0
    return tb - ta
  })
  return sorted[0]?.version_id ?? null
}

function LineagePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tenantId, projectId, token } = useAppContext()
  const canScope = tenantId !== "all" && projectId !== "all"
  const enabled = Boolean(token?.trim()) && canScope

  const runParam = (searchParams.get("run") || searchParams.get("run_id") || "").trim()
  const datasetVersionParam = (
    searchParams.get("datasetVersion") ||
    searchParams.get("datasetVersionId") ||
    ""
  ).trim()
  const datasetIdParam = (searchParams.get("datasetId") || "").trim()
  const resolvingDatasetId = Boolean(datasetIdParam) && !runParam && !datasetVersionParam && enabled

  const resolveDatasetQuery = useQuery({
    queryKey: ["lineage-resolve-dataset", tenantId, projectId, datasetIdParam] as const,
    queryFn: async () => {
      const { items } = await fetchDatasetVersions(tenantId, projectId, datasetIdParam, token)
      return pickLatestVersionId(items)
    },
    enabled: resolvingDatasetId,
  })

  useEffect(() => {
    if (!resolvingDatasetId) return
    if (resolveDatasetQuery.isSuccess) {
      const vid = resolveDatasetQuery.data
      if (vid) {
        router.replace(`/lineage?datasetVersion=${encodeURIComponent(vid)}`)
      } else {
        router.replace(`/datasets/${encodeURIComponent(datasetIdParam)}`)
      }
    } else if (resolveDatasetQuery.isError) {
      router.replace(`/datasets/${encodeURIComponent(datasetIdParam)}`)
    }
  }, [
    resolvingDatasetId,
    resolveDatasetQuery.isSuccess,
    resolveDatasetQuery.isError,
    resolveDatasetQuery.data,
    datasetIdParam,
    router,
  ])

  const [runInput, setRunInput] = useState(runParam)
  const [dvInput, setDvInput] = useState(datasetVersionParam)

  useEffect(() => {
    setRunInput(runParam)
    setDvInput(datasetVersionParam)
  }, [runParam, datasetVersionParam])

  const mode: "run" | "datasetVersion" | null = runParam ? "run" : datasetVersionParam ? "datasetVersion" : null

  const lineageRunQuery = useQuery({
    queryKey: mlairKeys.lineage.run(tenantId, projectId, runParam),
    queryFn: () => fetchLineageForRun(tenantId, projectId, runParam, token),
    enabled: enabled && mode === "run",
  })

  const lineageNbQuery = useQuery({
    queryKey: [...mlairKeys.lineage.neighborhood(tenantId, projectId, datasetVersionParam), 2, "both"] as const,
    queryFn: () => fetchLineageNeighborhood(tenantId, projectId, token, datasetVersionParam, 2, "both"),
    enabled: enabled && mode === "datasetVersion",
  })

  const graph = useMemo(() => {
    if (mode === "run" && lineageRunQuery.data) {
      return buildFromRunLineage(lineageRunQuery.data.edges, undefined)
    }
    if (mode === "datasetVersion" && lineageNbQuery.data) {
      return buildFromNeighborhood(lineageNbQuery.data.edges, lineageNbQuery.data.dataset_versions)
    }
    return { nodes: [] as LineageGraphNode[], edges: [] as LineageGraphEdge[] }
  }, [mode, lineageRunQuery.data, lineageNbQuery.data])

  const activeError =
    mode === "run"
      ? lineageRunQuery.isError
        ? lineageRunQuery.error
        : null
      : mode === "datasetVersion"
        ? lineageNbQuery.isError
          ? lineageNbQuery.error
          : null
        : null

  const activeLoading =
    resolvingDatasetId && resolveDatasetQuery.isLoading
      ? true
      : mode === "run"
        ? lineageRunQuery.isLoading
        : mode === "datasetVersion"
          ? lineageNbQuery.isLoading
          : false

  const runLoading = mode === "run" && (lineageRunQuery.isLoading || lineageRunQuery.isFetching)
  const dvLoading = mode === "datasetVersion" && (lineageNbQuery.isLoading || lineageNbQuery.isFetching)

  const loadBtnClass =
    "h-8 shrink-0 gap-2 border-border bg-card text-xs text-muted-foreground hover:text-foreground"

  const applyRun = () => {
    const r = runInput.trim()
    if (!r) return
    router.push(`/lineage?run=${encodeURIComponent(r)}`)
  }

  const applyDatasetVersion = () => {
    const v = dvInput.trim()
    if (!v) return
    router.push(`/lineage?datasetVersion=${encodeURIComponent(v)}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Network}
        accent="zinc"
        title="Lineage"
      />

      <div className="page-toolbar">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                placeholder="run_…"
                className="h-8 min-w-[200px] border-border bg-card font-mono text-xs"
                disabled={!canScope}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyRun()
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={loadBtnClass}
                onClick={applyRun}
                disabled={!runInput.trim() || !canScope || runLoading}
              >
                {runLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={dvInput}
                onChange={(e) => setDvInput(e.target.value)}
                placeholder="dataset_versions.version_id"
                className="h-8 min-w-[220px] border-border bg-card font-mono text-xs"
                disabled={!canScope}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyDatasetVersion()
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={loadBtnClass}
                onClick={applyDatasetVersion}
                disabled={!dvInput.trim() || !canScope || dvLoading}
              >
                {dvLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="page-toolbar">
        <LineageLegend />
      </div>

      {activeError ? (
        <div className="shrink-0 border-b border-border bg-[color:var(--status-failed-bg)] px-6 py-2 text-xs text-destructive">
          {formatApiClientError(activeError)}
        </div>
      ) : null}

      {resolvingDatasetId && resolveDatasetQuery.isLoading ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Resolving latest version for dataset{" "}
          <span className="font-mono text-muted-foreground">{datasetIdParam}</span>…
        </div>
      ) : null}

      {mode && activeLoading && !(resolvingDatasetId && resolveDatasetQuery.isLoading) ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading lineage…
        </div>
      ) : null}

      {mode && !activeLoading && graph.nodes.length === 0 && !activeError ? (
        <div className="shrink-0 border-b border-border surface-muted px-6 py-4">
          <MlopsEmptyState
            icon={Network}
            title="No lineage edges"
            description="The API returned no graph nodes for this query."
            className="border-0 bg-transparent p-0"
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {!canScope ? (
          <div className="shrink-0 px-4 pt-4 sm:px-6">
            <ScopePinnedInline message={SCOPE_AGGREGATE_LINEAGE} />
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1 scroll-region">
          {!mode ? (
            <div className="flex h-full items-center justify-center p-8">
              <MlopsEmptyState
                icon={Network}
                title="No graph loaded"
                description="Enter a run ID or dataset version ID above, use ?datasetId= for the latest version of a dataset, or open lineage from a run or dataset page."
                className="max-w-lg border-0 bg-transparent"
              />
            </div>
          ) : (
            <LineageGraph nodes={graph.nodes} edges={graph.edges} />
          )}
        </div>
      </div>
    </div>
  )
}

export default function LineagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading lineage…
        </div>
      }
    >
      <LineagePageInner />
    </Suspense>
  )
}
