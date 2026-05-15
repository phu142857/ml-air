"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Database,
  GitBranch,
  Play,
  History,
  Box,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { cn, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import {
  fetchAuditTimeline,
  fetchDatasets,
  fetchModels,
  fetchPipelines,
  fetchRuns,
  type RunItem,
  type PipelineItem,
} from "@/lib/api"
import { auditEventTitle, auditResourceHref } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style"

function pipelineLooksRunning(p: PipelineItem): boolean {
  return String(p.latest_status || "")
    .toUpperCase()
    .includes("RUN")
}

export default function DashboardPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = tenantId !== "all" && projectId !== "all"
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [triggerMode, setTriggerMode] = useState<TriggerRunMode>("simple")

  const datasetsQ = useQuery({
    queryKey: mlairKeys.datasets.list(tenantId, projectId),
    queryFn: () => fetchDatasets(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })
  const pipelinesQ = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })
  const runsQ = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })
  const modelsQ = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })
  const auditQ = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, {}),
    queryFn: () => fetchAuditTimeline(tenantId, projectId, token, { limit: 12 }),
    enabled: Boolean(token?.trim()),
  })

  const ds = datasetsQ.data?.items ?? []
  const pl = pipelinesQ.data?.items ?? []
  const rn = runsQ.data?.items ?? []
  const md = modelsQ.data?.items ?? []

  const datasetsWithRows = ds.filter((d) => (d.current_size ?? 0) > 0).length
  const runningPipelines = pl.filter(pipelineLooksRunning)
  const failedRuns = rn.filter((r) => normalizeStatus(r.status) === "FAILED")
  const recentRuns = [...rn]
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime()
      const tb = new Date(b.updated_at || b.created_at || 0).getTime()
      return tb - ta
    })
    .slice(0, 5)

  const quickStats = [
    {
      label: "Datasets",
      value: datasetsQ.isLoading ? null : ds.length,
      sub: `${datasetsWithRows} with rows`,
      icon: Database,
      href: "/datasets",
      color: "from-emerald-500 to-emerald-600",
    },
    {
      label: "Pipelines",
      value: pipelinesQ.isLoading ? null : pl.length,
      sub: `${runningPipelines.length} running`,
      icon: GitBranch,
      href: "/pipelines",
      color: "from-amber-500 to-amber-600",
    },
    {
      label: "Recent Runs",
      value: runsQ.isLoading ? null : rn.length,
      sub: `${failedRuns.length} failed`,
      icon: Play,
      href: "/runs",
      color: "from-sky-500 to-sky-600",
    },
    {
      label: "Models",
      value: modelsQ.isLoading ? null : md.length,
      sub: "registry",
      icon: Box,
      href: "/models",
      color: "from-violet-500 to-violet-600",
    },
  ]

  const listErr =
    datasetsQ.isError || pipelinesQ.isError || runsQ.isError || modelsQ.isError
      ? [
          datasetsQ.error && `Datasets: ${formatApiClientError(datasetsQ.error)}`,
          pipelinesQ.error && `Pipelines: ${formatApiClientError(pipelinesQ.error)}`,
          runsQ.error && `Runs: ${formatApiClientError(runsQ.error)}`,
          modelsQ.error && `Models: ${formatApiClientError(modelsQ.error)}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null

  const openTrigger = (pipelineId?: string, mode: TriggerRunMode = "simple") => {
    setTriggerPipelineId(pipelineId)
    setTriggerMode(mode)
    setTriggerOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      <TriggerRunUrlSync
        enabled={scopePinned}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
            <p className="text-xs text-zinc-500">
              Scope <span className="font-mono text-zinc-400">{tenantId}</span> /{" "}
              <span className="font-mono text-zinc-400">{projectId}</span>
              {!scopePinned ? (
                <span className="text-amber-500/90"> · pick a single tenant + project for audit feed</span>
              ) : null}
            </p>
          </div>
          <span
            className="inline-flex"
            title={!scopePinned ? "Select a specific tenant and project to start a run." : undefined}
          >
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 bg-sky-600 text-white hover:bg-sky-500"
              disabled={!token.trim() || !scopePinned}
              onClick={() => openTrigger()}
            >
              <Play className="h-3.5 w-3.5" />
              Trigger Run
            </Button>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-2 border-amber-700/50 bg-zinc-900 text-amber-300 hover:bg-zinc-800"
            disabled={!token.trim() || !scopePinned}
            onClick={() => openTrigger(undefined, "gated")}
            title="Pipeline execution gate (readiness)"
          >
            Gated
          </Button>
          <TriggerRunDialog
            open={triggerOpen}
            onOpenChange={setTriggerOpen}
            defaultPipelineId={triggerPipelineId}
            mode={triggerMode}
            onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {listErr ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {listErr}
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickStats.map((stat) => {
            const Icon = stat.icon
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className={cn("rounded-lg bg-gradient-to-br p-2", stat.color)}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-500" />
                </div>
                <div className="mb-1 text-2xl font-semibold text-zinc-100">
                  {stat.value === null ? <Loader2 className="h-6 w-6 animate-spin text-zinc-500" /> : stat.value}
                </div>
                <div className="text-xs text-zinc-500">{stat.label}</div>
                <div className="mt-1 text-[10px] text-zinc-500">{stat.sub}</div>
              </Link>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-300">Recent activity</span>
              </div>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-zinc-500 hover:text-zinc-100">
                <Link href="/lifecycle">View all</Link>
              </Button>
            </div>
            <div className="space-y-3 p-4">
              {!scopePinned ? (
                <p className="text-xs text-zinc-500">
                  Aggregate scope — showing recent events across up to 12 tenant/project pairs.
                </p>
              ) : null}
              {auditQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : auditQ.isError ? (
                <p className="text-xs text-red-300">{formatApiClientError(auditQ.error)}</p>
              ) : (auditQ.data?.items ?? []).length === 0 && scopePinned ? (
                <p className="text-xs text-zinc-500">No audit events yet.</p>
              ) : (auditQ.data?.items ?? []).length === 0 ? (
                <p className="text-xs text-zinc-500">No audit events in sampled scopes.</p>
              ) : (
                (auditQ.data?.items ?? []).map((event, i) => {
                  const href = auditResourceHref(event)
                  const inner = (
                    <>
                      <div
                        className={cn(
                          "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                          event.kind?.toLowerCase().includes("fail") && "bg-red-500",
                          !event.kind?.toLowerCase().includes("fail") && "bg-sky-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-sm text-zinc-300", href && "group-hover:text-sky-300")}>
                          {auditEventTitle(event)}
                        </div>
                        <div className="text-xs text-zinc-600">{formatRelativeTime(event.ts)}</div>
                      </div>
                    </>
                  )
                  return href ? (
                    <Link
                      key={`${event.ts}-${event.resource_id}-${i}`}
                      href={href}
                      className="group flex items-start gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-zinc-800/50"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={`${event.ts}-${event.resource_id}-${i}`} className="flex items-start gap-3">
                      {inner}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-300">Recent runs</span>
              </div>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-zinc-500 hover:text-zinc-100">
                <Link href="/runs">View all</Link>
              </Button>
            </div>
            <div className="space-y-2 p-4">
              {runsQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : runsQ.isError ? (
                <p className="text-xs text-red-300">{formatApiClientError(runsQ.error)}</p>
              ) : recentRuns.length === 0 ? (
                <p className="text-xs text-zinc-500">No runs yet.</p>
              ) : (
                recentRuns.map((run) => (
                  <Link
                    key={run.run_id}
                    href={`/runs/${encodeURIComponent(run.run_id)}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm text-zinc-200">{run.pipeline_id}</div>
                      <div className="truncate font-mono text-[10px] text-zinc-600">{run.run_id}</div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-medium",
                        statusBadgeClass(run.status),
                      )}
                    >
                      {normalizeStatus(run.status)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
              <TrendingUp className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-300">System status</span>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-sky-400" />
                  <span className="text-xs text-zinc-500">Running pipelines</span>
                </div>
                {pipelinesQ.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                ) : runningPipelines.length > 0 ? (
                  <div className="space-y-2">
                    {runningPipelines.slice(0, 4).map((p) => (
                      <Link
                        key={p.pipeline_id}
                        href={`/pipelines/${encodeURIComponent(p.pipeline_id)}`}
                        className="flex items-center justify-between rounded border border-sky-500/20 bg-sky-500/10 px-2 py-1.5 transition-colors hover:bg-sky-500/20"
                      >
                        <span className="truncate font-mono text-sm text-sky-300">{p.pipeline_id}</span>
                        <span className="shrink-0 text-xs text-sky-400">{String(p.latest_status || "").slice(0, 12)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-2 text-xs text-zinc-600">No pipelines marked running in list metadata.</div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-xs text-zinc-500">Recent failures</span>
                </div>
                {runsQ.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                ) : failedRuns.length > 0 ? (
                  <div className="space-y-2">
                    {failedRuns.slice(0, 3).map((run: RunItem) => (
                      <Link
                        key={run.run_id}
                        href={`/runs/${encodeURIComponent(run.run_id)}`}
                        className="flex items-center justify-between rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 transition-colors hover:bg-red-500/20"
                      >
                        <span className="truncate font-mono text-sm text-red-300">{run.pipeline_id}</span>
                        <span className="shrink-0 font-mono text-xs text-red-400">{run.run_id.slice(0, 10)}…</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    No failed runs in fetched window
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
