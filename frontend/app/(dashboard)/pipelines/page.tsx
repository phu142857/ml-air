"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { GitBranch, Plus, Database, Loader2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/mlops/status-badge"
import { PipelineDAG } from "@/components/mlops/pipeline-dag"
import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, pageHeaderActionClass } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { formatVersionLabel } from "@/lib/version-label"
import { useAppContext } from "@/lib/app-context"
import { fetchPipelineVersions } from "@/lib/api"
import { pickLatestPipelineVersion } from "@/lib/pipeline-config"
import { usePipelineTopology } from "@/hooks/use-pipeline-topology"
import { usePipelinesList } from "@/hooks/use-pipelines-list"
import { mlairKeys } from "@/lib/query-keys"
import { isScopePinned } from "@/lib/scope"
import { normalizePipelineForDag } from "@/lib/adapt-pipeline-dag"
import type { Pipeline } from "@/lib/pipeline-types"

export default function PipelinesPage() {
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listQuery, setListQuery] = useState("")

  const pipelinesQuery = usePipelinesList(Boolean(token?.trim()))
  const showLoadMore = scopePinned && pipelinesQuery.hasNextPage

  const items = pipelinesQuery.items

  const filteredItems = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => p.pipeline_id.toLowerCase().includes(q))
  }, [items, listQuery])

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
    if (!filteredItems.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !filteredItems.some((p) => p.pipeline_id === selectedId)) {
      setSelectedId(filteredItems[0].pipeline_id)
    }
  }, [filteredItems, selectedId])

  const selected = useMemo(
    () => filteredItems.find((p) => p.pipeline_id === selectedId) ?? null,
    [filteredItems, selectedId],
  )

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
        accent="zinc"
        title="Pipelines"
        actions={
          scopePinned ? (
            <Button asChild size="sm" className={pageHeaderActionClass}>
              <Link href="/pipelines/new">
                <Plus className="h-3.5 w-3.5" />
                Import pipeline
              </Link>
            </Button>
          ) : null
        }
      />

      <PageScrollBody
      >
        <ScopedListContent
          isLoading={pipelinesQuery.isLoading}
          isError={pipelinesQuery.isError}
          errorMessage={pipelinesQuery.error ? formatApiClientError(pipelinesQuery.error) : undefined}
          isEmpty={filteredItems.length === 0}
          emptyIcon={GitBranch}
          emptyTitle="No pipelines"
          skeletonRows={4}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
              <div className="shrink-0 border-b border-border px-3 py-2">
                <Input
                  placeholder="Filter pipelines…"
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  className="h-8 bg-background"
                  aria-label="Filter pipelines"
                />
              </div>
              <div className="scroll-region min-h-0 max-h-[min(70vh,640px)] flex-1">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Pipeline</th>
                      <th className="hidden px-2 py-2 font-medium sm:table-cell">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((pipeline) => {
                      const isSelected = selectedId === pipeline.pipeline_id
                      const configVer = latestConfigVersionByPipeline.get(pipeline.pipeline_id)
                      const versionIndex = items.findIndex((p) => p.pipeline_id === pipeline.pipeline_id)

                      return (
                        <tr key={pipeline.pipeline_id}>
                          <td colSpan={3} className="p-0">
                            <button
                              type="button"
                              onClick={() => setSelectedId(pipeline.pipeline_id)}
                              className={cn(
                                "interactive-row grid w-full grid-cols-1 items-center gap-1 border-0 border-b border-border px-3 py-2 text-left sm:grid-cols-[1fr_auto_auto]",
                                isSelected && "bg-primary/[0.04] ring-1 ring-inset ring-primary/20",
                              )}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="truncate font-mono text-xs font-medium text-foreground">
                                  {pipeline.pipeline_id}
                                </span>
                                {configVer != null ? (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 font-mono text-[10px] text-[color:var(--status-pending-fg)]"
                                  >
                                    {formatVersionLabel(configVer)}
                                  </Badge>
                                ) : versionQueries[versionIndex]?.isLoading ? (
                                  <Loader2 className="h-3 w-3 shrink-0 motion-safe-spin text-muted-foreground" />
                                ) : null}
                              </div>
                              <div className="hidden sm:block">
                                {!pipeline.latest_status ||
                                String(pipeline.latest_status).toLowerCase() === "idle" ? (
                                  <StatusBadge status="cancelled" label="Idle" size="sm" />
                                ) : (
                                  <StatusBadge value={pipeline.latest_status} size="sm" />
                                )}
                              </div>
                              <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                                {formatRelativeTime(pipeline.updated_at)}
                              </span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {showLoadMore ? (
                <div className="shrink-0 border-t border-border p-2 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={pipelinesQuery.isFetchingNextPage}
                    onClick={() => void pipelinesQuery.fetchNextPage?.()}
                  >
                    {pipelinesQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 lg:col-span-2">
              {!displayPipeline ? (
                <MlopsEmptyState icon={GitBranch} title="Select a pipeline" className="border-0 bg-transparent p-0" />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-foreground">
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

                  <div className="rounded-md border border-border bg-card p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pipeline topology
                    </h3>
                    <PipelineDAG key={selectedId} pipeline={displayPipeline} />
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
