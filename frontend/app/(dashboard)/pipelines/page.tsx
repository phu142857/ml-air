"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { GitBranch, Plus, Play, Clock, CheckCircle2, XCircle, Loader2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PipelineDAG } from "@/components/mlops/pipeline-dag"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchPipelineDag, fetchPipelines } from "@/lib/api"
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_PIPELINES } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import {
  dagDataMatchesPipeline,
  normalizePipelineForDag,
  pipelineFromDagQueryData,
} from "@/lib/adapt-pipeline-dag"
import type { Pipeline, PipelineStage } from "@/lib/pipeline-types"

const statusConfig = {
  idle: { icon: Clock, label: "Idle", color: "text-muted-foreground", bg: "bg-muted", border: "border-border", animate: false },
  pending: { icon: Clock, label: "Pending", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", animate: false },
  running: { icon: Loader2, label: "Running", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", animate: true },
  success: { icon: CheckCircle2, label: "Success", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", animate: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", animate: false },
}

function mapListStatus(raw: string): keyof typeof statusConfig {
  const u = String(raw || "").toUpperCase()
  if (u.includes("RUN")) return "running"
  if (u.includes("FAIL")) return "failed"
  if (u.includes("SUCCESS") || u.includes("OK") || u.includes("DONE") || u.includes("COMPLETE")) return "success"
  if (u.includes("PEND") || u.includes("QUEUE") || u.includes("WAIT")) return "pending"
  return "idle"
}

const pipelineStageColumns: DataTableColumn<PipelineStage>[] = [
  {
    id: "stage",
    header: "Stage",
    cell: (stage) => <span className="text-sm text-foreground">{stage.name}</span>,
  },
  {
    id: "type",
    header: "Type",
    cell: (stage) => (
      <span className="font-mono text-xs capitalize text-muted-foreground">{stage.type}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (stage) => {
      const st = statusConfig[stage.status as keyof typeof statusConfig] || statusConfig.idle
      const StatusIcon = st.icon
      return (
        <div
          className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs", st.bg, st.color)}
        >
          <StatusIcon className={cn("h-3 w-3", st.animate && "animate-spin")} />
          {st.label}
        </div>
      )
    },
  },
  {
    id: "dependencies",
    header: "Dependencies",
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
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const openGatedTrigger = (pipelineId?: string) => {
    const pid = pipelineId || selectedId || undefined
    if (pid) setSelectedId(pid)
    setTriggerPipelineId(pid)
    setTriggerOpen(true)
  }

  const pipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })

  const items = pipelinesQuery.data?.items ?? []

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

  const dagEnabled = Boolean(selectedId && token.trim()) && scopePinned

  const dagQuery = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, selectedId || ""),
    queryFn: () => fetchPipelineDag(tenantId, projectId, selectedId!, token),
    enabled: dagEnabled && Boolean(selectedId),
    retry: false,
  })

  const dagDataReady =
    Boolean(selectedId) && dagDataMatchesPipeline(dagQuery.data, selectedId || "")

  const dagPipeline = useMemo(
    () =>
      selectedId && dagDataReady ? pipelineFromDagQueryData(selectedId, dagQuery.data) : null,
    [selectedId, dagQuery.data, dagDataReady],
  )

  const dagLoading =
    dagEnabled &&
    Boolean(selectedId) &&
    !dagDataReady &&
    (dagQuery.isLoading || dagQuery.isFetching)

  const displayPipeline: Pipeline | null = useMemo(() => {
    if (!selectedId) return null
    if (dagPipeline) return normalizePipelineForDag(dagPipeline) ?? dagPipeline
    const label = !dagEnabled
      ? "Select a single tenant + project to load DAG"
      : dagLoading
        ? "Loading DAG…"
        : dagQuery.isError
          ? `DAG error — ${formatApiClientError(dagQuery.error)}`
          : "No DAG preview"
    return {
      id: selectedId,
      name: selectedId,
      version: selected?.latest_run_id ? `last run ${selected.latest_run_id.slice(0, 10)}…` : "—",
      status: ((): Pipeline["status"] => {
        const m = mapListStatus(selected?.latest_status || "")
        if (m === "failed") return "failed"
        if (m === "running") return "running"
        if (m === "success") return "success"
        return "idle"
      })(),
      stages: [
        {
          id: "_preview",
          name: label.slice(0, 120),
          type: "transform",
          status: dagLoading ? "running" : "idle",
          dependencies: [],
        },
      ],
    }
  }, [selectedId, dagPipeline, dagLoading, dagQuery.isError, dagQuery.error, dagEnabled, selected])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TriggerRunUrlSync enabled={scopePinned} onOpen={({ pipelineId }) => openGatedTrigger(pipelineId)} />
      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={triggerPipelineId || selectedId || undefined}
        mode="gated"
        lockPipeline={Boolean(triggerPipelineId)}
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />

      <ResourcePageHeader
        icon={GitBranch}
        accent="amber"
        title="Pipelines"
        subtitle={isAggregate ? `All projects · ${items.length} pipelines` : `${items.length} pipelines`}
      />

      <div className="flex-1 space-y-6 overflow-auto p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINES} /> : null}
        <ScopedListContent
          isLoading={pipelinesQuery.isLoading}
          isError={pipelinesQuery.isError}
          errorMessage={pipelinesQuery.error ? formatApiClientError(pipelinesQuery.error) : undefined}
          isEmpty={items.length === 0}
          emptyIcon={GitBranch}
          emptyTitle="No pipelines in this scope"
          emptyDescription="Create a pipeline or pick a workspace in the header."
          skeletonRows={4}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3">
              <h2 className="px-1 text-sm font-medium capitalize text-muted-foreground">All pipelines</h2>
              {items.map((pipeline) => {
                const sk = mapListStatus(pipeline.latest_status)
                const status = statusConfig[sk]
                const StatusIcon = status.icon
                const isSelected = selectedId === pipeline.pipeline_id

                return (
                  <button
                    key={pipeline.pipeline_id}
                    type="button"
                    onClick={() => setSelectedId(pipeline.pipeline_id)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition-all",
                      isSelected
                        ? "border-border bg-muted/80"
                        : "border-border bg-card/80 hover:bg-card",
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Link
                          href={`/pipelines/${encodeURIComponent(pipeline.pipeline_id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-mono text-sm font-medium text-foreground hover:text-sky-400"
                        >
                          {pipeline.pipeline_id}
                        </Link>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-border font-mono text-[10px] text-muted-foreground">
                        {pipeline.total_runs} runs
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs",
                          status.bg,
                          status.color,
                        )}
                      >
                        <StatusIcon className={cn("h-3 w-3", status.animate && "animate-spin")} />
                        {status.label}
                      </div>
                      <span className="text-[10px] text-muted-foreground/80">
                        {formatRelativeTime(pipeline.updated_at)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="space-y-6 lg:col-span-2">
              {!displayPipeline ? (
                <MlopsEmptyState
                  icon={GitBranch}
                  title="Select a pipeline"
                  description="Choose a pipeline from the list to preview its DAG."
                  className="border-0 bg-transparent p-0"
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-foreground">
                        {selected?.pipeline_id || displayPipeline.id}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <Badge variant="outline" className="border-border font-mono text-xs text-muted-foreground">
                          latest status: {selected?.latest_status || "—"}
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
                        className="h-8 gap-2 bg-amber-600 text-white hover:bg-amber-500 hover:text-white disabled:bg-amber-600/50 disabled:text-white/90"
                        disabled={!selectedId}
                        title={!selectedId ? "Select a pipeline to add a config version" : undefined}
                        onClick={() => router.push(`/pipelines/${encodeURIComponent(selectedId!)}/versions`)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New version
                      </Button>
                      <span
                        className="inline-flex"
                        title={
                          !scopePinned
                            ? "Select a specific tenant and project to start a run."
                            : !selectedId
                              ? "Select a pipeline first."
                              : undefined
                        }
                      >
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2 bg-sky-600 text-white hover:bg-sky-500 hover:text-white disabled:bg-sky-600/50 disabled:text-white/90"
                          disabled={!token.trim() || !scopePinned || !selectedId}
                          onClick={() => openGatedTrigger(selectedId || undefined)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Trigger run
                        </Button>
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">Pipeline DAG</h3>
                    <PipelineDAG key={selectedId} pipeline={displayPipeline} />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">Stages</h3>
                    <MlopsDataTable
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
      </div>
    </div>
  )
}
