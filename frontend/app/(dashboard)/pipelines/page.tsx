"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { GitBranch, Plus, Database, Loader2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/mlops/status-badge"
import { PipelineDAG } from "@/components/mlops/pipeline-dag"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { formatVersionLabel } from "@/lib/version-label"
import { useAppContext } from "@/lib/app-context"
import { fetchPipelineVersions } from "@/lib/api"
import { pickLatestPipelineVersion } from "@/lib/pipeline-config"
import { usePipelineTopology } from "@/hooks/use-pipeline-topology"
import { usePipelinesList } from "@/hooks/use-pipelines-list"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_PIPELINES } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { normalizePipelineForDag } from "@/lib/adapt-pipeline-dag"
import type { Pipeline, PipelineStage } from "@/lib/pipeline-types"

import type { StatusChipKey } from "@/lib/status-style"

function mapStageStatus(raw: string): StatusChipKey | "idle" {
  const u = String(raw || "").toUpperCase()
  if (u.includes("RUN")) return "running"
  if (u.includes("FAIL")) return "failed"
  if (u.includes("SUCCESS") || u.includes("OK") || u.includes("DONE") || u.includes("COMPLETE"))
    return "success"
  if (u.includes("PEND") || u.includes("QUEUE") || u.includes("WAIT")) return "pending"
  return "idle"
}

const pipelineStageColumns: DataTableColumn<PipelineStage>[] = [
  {
    id: "stage",
    header: "Stage",
    width: 200,
    canHide: false,
    getSearchValue: (stage) => stage.name,
    getSortValue: (stage) => stage.name,
    cell: (stage) => <span className="text-sm text-foreground">{stage.name}</span>,
  },
  {
    id: "type",
    header: "Type",
    width: 140,
    getSearchValue: (stage) => stage.type,
    getSortValue: (stage) => stage.type,
    getFilterValue: (stage) => stage.type,
    cell: (stage) => (
      <span className="font-mono text-xs capitalize text-muted-foreground">{stage.type}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: 140,
    getSortValue: (stage) => mapStageStatus(stage.status),
    getFilterValue: (stage) => mapStageStatus(stage.status),
    filterOptions: [
      { label: "Running", value: "running" },
      { label: "Failed", value: "failed" },
      { label: "Success", value: "success" },
      { label: "Pending", value: "pending" },
      { label: "Idle", value: "idle" },
    ],
    cell: (stage) => {
      const sk = mapStageStatus(stage.status)
      if (sk === "idle") {
        return <StatusBadge status="cancelled" label="Idle" size="sm" />
      }
      return <StatusBadge value={stage.status} size="sm" />
    },
  },
  {
    id: "dependencies",
    header: "Dependencies",
    width: 240,
    wrap: true,
    getSearchValue: (stage) => stage.dependencies.join(" "),
    getSortValue: (stage) => stage.dependencies.length,
    cell: (stage) =>
      stage.dependencies.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {stage.dependencies.map((dep) => (
            <Badge
              key={dep}
              variant="outline"
              className="border-border font-mono text-[10px] text-muted-foreground"
            >
              {dep}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/80">None</span>
      ),
  },
]

export default function PipelinesPage() {
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const pipelinesQuery = usePipelinesList(Boolean(token?.trim()))
  const showLoadMore = scopePinned && pipelinesQuery.hasNextPage

  const items = pipelinesQuery.items

  const versionQueries = useQueries({
    queries: items.map((p) => ({
      queryKey: mlairKeys.pipelines.versions(tenantId, projectId, p.pipeline_id),
      queryFn: () => fetchPipelineVersions(tenantId, projectId, p.pipeline_id, token),
      enabled: scopePinned && Boolean(token?.trim()),
      staleTime: 60_000,
    })),
  })

  const latestConfigVersionByPipeline = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((p, i) => {
      const latest = pickLatestPipelineVersion(versionQueries[i]?.data?.items ?? [])
      if (latest) map.set(p.pipeline_id, latest.version)
    })
    return map
  }, [items, versionQueries])

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !items.some((p) => p.pipeline_id === selectedId)) {
      setSelectedId(items[0].pipeline_id)
    }
  }, [items, selectedId])

  const selected = useMemo(() => items.find((p) => p.pipeline_id === selectedId) ?? null, [items, selectedId])

  const topologyEnabled = Boolean(selectedId && token.trim()) && scopePinned

  const {
    topologyQuery,
    pipeline: topologyPipeline,
    isLoading: topologyLoading,
  } = usePipelineTopology(
    tenantId,
    projectId,
    selectedId || "",
    token,
    topologyEnabled && Boolean(selectedId),
  )

  const displayPipeline: Pipeline | null = useMemo(() => {
    if (!selectedId) return null
    if (topologyPipeline) return normalizePipelineForDag(topologyPipeline) ?? topologyPipeline
    const label = !topologyEnabled
      ? "Select a single tenant + project to load topology"
      : topologyLoading
        ? "Loading topology…"
        : topologyQuery.isError
          ? `Topology error — ${formatApiClientError(topologyQuery.error)}`
          : "No topology preview"
    return {
      id: selectedId,
      name: selectedId,
      version: selected?.latest_run_id ? `last run ${selected.latest_run_id.slice(0, 10)}…` : "—",
      status: "idle" as const,
      stages: [
        {
          id: "_preview",
          name: label.slice(0, 120),
          type: "transform",
          status: topologyLoading ? "running" : "idle",
          dependencies: [],
        },
      ],
    }
  }, [
    selectedId,
    topologyPipeline,
    topologyLoading,
    topologyQuery.isError,
    topologyQuery.error,
    topologyEnabled,
    selected,
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={GitBranch}
        accent="amber"
        title="Pipelines"
      />

      <PageScrollBody
      >
        <ScopedListContent
          isLoading={pipelinesQuery.isLoading}
          isError={pipelinesQuery.isError}
          errorMessage={pipelinesQuery.error ? formatApiClientError(pipelinesQuery.error) : undefined}
          isEmpty={items.length === 0}
          emptyIcon={GitBranch}
          emptyTitle="No pipelines"
          emptyDescription=""
          skeletonRows={4}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3">
              <h2 className="px-1 text-sm font-medium capitalize text-muted-foreground">All pipelines</h2>
              {items.map((pipeline, index) => {
                const isSelected = selectedId === pipeline.pipeline_id
                const configVer = latestConfigVersionByPipeline.get(pipeline.pipeline_id)

                return (
                  <button
                    key={pipeline.pipeline_id}
                    type="button"
                    onClick={() => setSelectedId(pipeline.pipeline_id)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-default",
                      isSelected
                        ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                        : "panel-surface hover:border-border",
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Link
                          href={`/pipelines/${encodeURIComponent(pipeline.pipeline_id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-mono text-sm font-medium text-foreground hover:text-primary"
                        >
                          {pipeline.pipeline_id}
                        </Link>
                        {configVer != null ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/30 font-mono text-[10px] text-[color:var(--status-pending-fg)]"
                            title="Latest published config version (used for new runs)"
                          >
                            {formatVersionLabel(configVer)}
                          </Badge>
                        ) : versionQueries[index]?.isLoading ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <Badge variant="outline" className="shrink-0 border-border font-mono text-[10px] text-muted-foreground">
                        {pipeline.total_runs} runs
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      {!pipeline.latest_status || String(pipeline.latest_status).toLowerCase() === "idle" ? (
                        <StatusBadge status="cancelled" label="Idle" size="sm" />
                      ) : (
                        <StatusBadge value={pipeline.latest_status} size="sm" />
                      )}
                      <span className="text-[10px] text-muted-foreground/80">
                        {formatRelativeTime(pipeline.updated_at)}
                      </span>
                    </div>
                  </button>
                )
              })}
              {showLoadMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pipelinesQuery.isFetchingNextPage}
                    onClick={() => void pipelinesQuery.fetchNextPage?.()}
                  >
                    {pipelinesQuery.isFetchingNextPage ? "Loading…" : "Load more pipelines"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-6 lg:col-span-2">
              {!displayPipeline ? (
                <MlopsEmptyState icon={GitBranch} title="Select a pipeline" className="border-0 bg-transparent p-0" />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-foreground">
                        {selected?.pipeline_id || displayPipeline.id}
                        {selectedId && latestConfigVersionByPipeline.get(selectedId) != null ? (
                          <span className="ml-2 font-mono text-sm font-normal text-[color:var(--status-pending-fg)]">
                            · config {formatVersionLabel(latestConfigVersionByPipeline.get(selectedId))}
                          </span>
                        ) : null}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <Badge variant="outline" className="border-border font-mono text-xs text-muted-foreground">
                          latest run status: {selected?.latest_status || "—"}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>updated {formatRelativeTime(selected?.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" asChild className="border-border bg-card">
                        <Link href={`/pipelines/${encodeURIComponent(selected?.pipeline_id || selectedId || "")}`}>
                          Open detail
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        disabled={!selectedId}
                        title={!selectedId ? "Select a pipeline to add a config version" : undefined}
                        asChild={Boolean(selectedId)}
                      >
                        {selectedId ? (
                          <Link href={`/pipelines/${encodeURIComponent(selectedId)}/versions`}>
                            <Plus className="h-3.5 w-3.5" />
                            New version
                          </Link>
                        ) : (
                          <span>
                            <Plus className="h-3.5 w-3.5" />
                            New version
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={!scopePinned}
                        asChild={scopePinned}
                      >
                        {scopePinned ? (
                          <Link href="/datasets">
                            <Database className="h-3.5 w-3.5" />
                            Run / Train
                          </Link>
                        ) : (
                          <span>
                            <Database className="h-3.5 w-3.5" />
                            Run / Train
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">Pipeline topology</h3>
                    <PipelineDAG key={selectedId} pipeline={displayPipeline} />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">Stages</h3>
                    <MlopsDataTable
                      tableId="pipeline-stages"
                      columns={pipelineStageColumns}
                      data={displayPipeline.stages}
                      keyExtractor={(s) => s.id}
                      emptyMessage="No stages in this view."
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </ScopedListContent>
      </PageScrollBody>
    </div>
  )
}
