"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { GitBranch, Plus, Play, Clock, CheckCircle2, XCircle, Loader2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PipelineDAG } from "@/components/mlops/pipeline-dag"
import { cn, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchPipelineDag, fetchPipelines } from "@/lib/api"
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { mlairKeys } from "@/lib/query-keys"
import { apiDagToMockPipeline, type ApiPipelineDag } from "@/lib/adapt-pipeline-dag"
import type { Pipeline } from "@/lib/pipeline-types"

const statusConfig = {
  idle: { icon: Clock, label: "Idle", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-700", animate: false },
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

export default function PipelinesPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const canTriggerScope = tenantId !== "all" && projectId !== "all"
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

  const dagEnabled =
    Boolean(selectedId && token.trim()) && tenantId !== "all" && projectId !== "all"

  const dagQuery = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, selectedId || ""),
    queryFn: async () => {
      const dag = await fetchPipelineDag(tenantId, projectId, selectedId!, token)
      return apiDagToMockPipeline(selectedId!, dag as ApiPipelineDag)
    },
    enabled: dagEnabled && Boolean(selectedId),
    retry: false,
  })

  const displayPipeline: Pipeline | null = useMemo(() => {
    if (!selectedId) return null
    if (dagQuery.data) return dagQuery.data
    const label = !dagEnabled
      ? "Select a single tenant + project to load DAG"
      : dagQuery.isLoading
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
          status: dagQuery.isLoading ? "running" : "idle",
          dependencies: [],
        },
      ],
    }
  }, [selectedId, dagQuery.data, dagQuery.isLoading, dagQuery.isError, dagQuery.error, dagEnabled, selected])

  return (
    <div className="flex flex-col h-full">
      <TriggerRunUrlSync
        enabled={canTriggerScope}
        onOpen={({ pipelineId }) => openGatedTrigger(pipelineId)}
      />
      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={triggerPipelineId || selectedId || undefined}
        mode="gated"
        lockPipeline={Boolean(triggerPipelineId)}
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/20 to-amber-600/10">
              <GitBranch className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Pipelines</h1>
              <p className="text-xs text-zinc-500">
                Scope <span className="font-mono text-zinc-400">{tenantId}</span> /{" "}
                <span className="font-mono text-zinc-400">{projectId}</span>
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 gap-2 bg-amber-600 text-white hover:bg-amber-500"
            disabled={!selectedId}
            title={!selectedId ? "Select a pipeline to add a config version" : "Create a new immutable pipeline version"}
            onClick={() => router.push(`/pipelines/${encodeURIComponent(selectedId!)}/versions`)}
          >
            <Plus className="h-3.5 w-3.5" />
            New version
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {pipelinesQuery.isError ? (
          <div className="m-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {formatApiClientError(pipelinesQuery.error)}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="space-y-3">
            <h2 className="px-1 text-sm font-medium text-zinc-400">All pipelines</h2>
            {pipelinesQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : null}
            {!pipelinesQuery.isLoading && items.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
                No pipelines in this scope.
              </p>
            ) : null}
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
                    isSelected ? "border-zinc-600 bg-zinc-800/50" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900",
                  )}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch className="h-4 w-4 shrink-0 text-zinc-500" />
                      <span className="truncate font-mono text-sm font-medium text-zinc-200">{pipeline.pipeline_id}</span>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-zinc-700 font-mono text-[10px] text-zinc-500">
                      {pipeline.total_runs} runs
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs", status.bg, status.color)}>
                      <StatusIcon className={cn("h-3 w-3", status.animate && "animate-spin")} />
                      {status.label}
                    </div>
                    <span className="text-[10px] text-zinc-600">{formatRelativeTime(pipeline.updated_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="space-y-6 lg:col-span-2">
            {!displayPipeline ? (
              <p className="text-sm text-zinc-500">Select a pipeline.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-zinc-100">{selected?.pipeline_id || displayPipeline.id}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <Badge variant="outline" className="border-zinc-700 font-mono text-xs text-zinc-400">
                        latest status: {selected?.latest_status || "—"}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Calendar className="h-3 w-3" />
                        <span>updated {formatRelativeTime(selected?.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" asChild className="border-zinc-700 bg-zinc-900">
                      <Link href={`/pipelines/${encodeURIComponent(selected?.pipeline_id || selectedId || "")}`}>
                        Open detail
                      </Link>
                    </Button>
                    <span
                      className="inline-flex"
                      title={
                        !canTriggerScope
                          ? "Select a specific tenant and project to start a run."
                          : !selectedId
                            ? "Select a pipeline first."
                            : undefined
                      }
                    >
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-sky-600 hover:bg-sky-500"
                        disabled={!token.trim() || !canTriggerScope || !selectedId}
                        onClick={() => openGatedTrigger(selectedId || undefined)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Trigger
                      </Button>
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium text-zinc-400">Pipeline DAG</h3>
                  <PipelineDAG pipeline={displayPipeline} />
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium text-zinc-400">Stages</h3>
                  <div className="overflow-hidden rounded-lg border border-zinc-800">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Stage</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Dependencies</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayPipeline.stages.map((stage) => {
                          const st = statusConfig[stage.status] || statusConfig.idle
                          const StatusIcon = st.icon

                          return (
                            <tr key={stage.id} className="border-b border-zinc-800 last:border-0">
                              <td className="px-4 py-3">
                                <span className="text-sm text-zinc-200">{stage.name}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs capitalize text-zinc-500">{stage.type}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs", st.bg, st.color)}>
                                  <StatusIcon className={cn("h-3 w-3", st.animate && "animate-spin")} />
                                  {st.label}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {stage.dependencies.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {stage.dependencies.map((dep) => (
                                      <Badge key={dep} variant="outline" className="border-zinc-700 font-mono text-[10px] text-zinc-500">
                                        {dep}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-zinc-600">None</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
