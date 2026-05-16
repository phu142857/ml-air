"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  History,
  Loader2,
  Network,
  Play,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import {
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
} from "@/components/mlops/layout"
import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { useDashboardStats } from "@/hooks/use-dashboard-stats"
import { fetchAuditTimeline } from "@/lib/api"
import { useAppContext } from "@/lib/app-context"
import { auditEventTitle, auditResourceHref } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_DASHBOARD } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style"
import { cn, formatApiClientError, formatRelativeTime } from "@/lib/utils"

const statIcons = [Database, GitBranch, Play, Box]

export default function DashboardPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const {
    isLoading,
    isAggregate,
    stats,
    runningPipelines,
    failedRuns,
    runs,
  } = useDashboardStats()

  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [triggerMode, setTriggerMode] = useState<TriggerRunMode>("simple")

  const auditQ = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, {}),
    queryFn: () => fetchAuditTimeline(tenantId, projectId, token, { limit: 12 }),
    enabled: Boolean(token?.trim()),
  })

  const recentRuns = [...runs]
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime()
      const tb = new Date(b.updated_at || b.created_at || 0).getTime()
      return tb - ta
    })
    .slice(0, 5)

  const openTrigger = (pipelineId?: string, mode: TriggerRunMode = "simple") => {
    setTriggerPipelineId(pipelineId)
    setTriggerMode(mode)
    setTriggerOpen(true)
  }

  const scopeSubtitle = isAggregate ? "Cross-project overview" : "Stats and recent activity"

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TriggerRunUrlSync
        enabled={scopePinned}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />

      <ResourcePageHeader
        className="shrink-0"
        icon={Network}
        accent="zinc"
        title="Dashboard"
        subtitle={scopeSubtitle}
        actions={
          <>
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
              className="h-8 gap-2 border-amber-700/50 bg-card text-amber-300 hover:bg-muted"
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
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DASHBOARD} /> : null}
        {isLoading ? (
          <ListTableSkeleton rows={4} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, i) => {
                const Icon = statIcons[i] ?? Database
                return (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="group rounded-lg border border-border bg-card/80 p-4 transition-colors hover:border-border hover:bg-card"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br",
                          stat.color,
                        )}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-muted-foreground" />
                    </div>
                    <div className="mb-1 text-2xl font-semibold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    {"ready" in stat && (
                      <div className="mt-1 text-[10px] text-emerald-400">{stat.ready} with rows</div>
                    )}
                    {"running" in stat && typeof stat.running === "number" && stat.running > 0 && (
                      <div className="mt-1 text-[10px] text-sky-400">{stat.running} running</div>
                    )}
                    {"failed" in stat && typeof stat.failed === "number" && stat.failed > 0 && (
                      <div className="mt-1 text-[10px] text-red-400">{stat.failed} failed</div>
                    )}
                    {"registered" in stat && (
                      <div className="mt-1 text-[10px] text-violet-400">
                        {stat.registered} in registry
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card/80 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                  Running pipelines
                </h3>
                {runningPipelines.length === 0 ? (
                  <MlopsEmptyState
                    icon={Loader2}
                    title="No running pipelines"
                    description="No pipelines are executing in this scope right now."
                    className="border-0 bg-transparent p-0"
                  />
                ) : (
                  <ul className="space-y-2">
                    {runningPipelines.slice(0, 6).map((p) => (
                      <li key={p.pipeline_id}>
                        <Link
                          href={`/pipelines/${encodeURIComponent(p.pipeline_id)}`}
                          className="font-mono text-sm text-sky-400 hover:underline"
                        >
                          {p.pipeline_id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card/80 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  Failed runs
                </h3>
                {failedRuns.length === 0 ? (
                  <MlopsEmptyState
                    icon={CheckCircle2}
                    title="All clear"
                    description="No failed runs in this scope."
                    className="border-0 bg-transparent p-0 [&_svg]:text-emerald-400"
                  />
                ) : (
                  <ul className="space-y-2">
                    {failedRuns.slice(0, 5).map((r) => (
                      <li key={r.run_id} className="flex items-center justify-between gap-2">
                        <Link
                          href={`/runs/${encodeURIComponent(r.run_id)}`}
                          className="truncate font-mono text-sm text-red-400 hover:underline"
                        >
                          {r.pipeline_id || r.run_id}
                        </Link>
                        <span className="shrink-0 text-[10px] text-muted-foreground/80 tabular-nums">
                          {formatRelativeTime(r.updated_at || r.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Recent lifecycle events
                  </h3>
                  <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-muted-foreground hover:text-foreground">
                    <Link href="/lifecycle">View all</Link>
                  </Button>
                </div>
                {!scopePinned ? (
                  <p className="mb-3 text-xs text-muted-foreground">Merged workspace scopes (API limits apply).</p>
                ) : null}
                {auditQ.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : auditQ.isError ? (
                  <p className="text-xs text-red-300">{formatApiClientError(auditQ.error)}</p>
                ) : (auditQ.data?.items ?? []).length === 0 ? (
                  <MlopsEmptyState
                    icon={History}
                    title="No events yet"
                    description={
                      scopePinned
                        ? "Lifecycle audit events will appear here."
                        : "No audit events in sampled scopes."
                    }
                    className="border-0 bg-transparent p-0"
                  />
                ) : (
                  (auditQ.data?.items ?? []).map((event, i) => {
                    const href = auditResourceHref(event)
                    const inner = (
                      <>
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm text-foreground/90",
                              href && "group-hover:text-sky-300",
                            )}
                          >
                            {auditEventTitle(event)}
                          </p>
                          <p className="text-[10px] text-muted-foreground/80 tabular-nums">
                            {formatRelativeTime(event.ts)}
                          </p>
                        </div>
                      </>
                    )
                    return href ? (
                      <Link
                        key={`${event.ts}-${event.resource_id}-${i}`}
                        href={href}
                        className="group flex items-start gap-3 border-b border-border/80 py-3 last:border-0 last:pb-0 first:pt-0"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        key={`${event.ts}-${event.resource_id}-${i}`}
                        className="flex items-start gap-3 border-b border-border/80 py-3 last:border-0 last:pb-0 first:pt-0"
                      >
                        {inner}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="rounded-lg border border-border bg-card/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Play className="h-4 w-4 text-muted-foreground" />
                    Recent runs
                  </h3>
                  <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-muted-foreground hover:text-foreground">
                    <Link href="/runs">View all</Link>
                  </Button>
                </div>
                {recentRuns.length === 0 ? (
                  <MlopsEmptyState
                    icon={Play}
                    title="No runs yet"
                    description="Trigger a pipeline run to see it here."
                    className="border-0 bg-transparent p-0"
                  />
                ) : (
                  <div className="space-y-2">
                    {recentRuns.map((run) => (
                      <Link
                        key={run.run_id}
                        href={`/runs/${encodeURIComponent(run.run_id)}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 transition-colors hover:border-border hover:bg-card/80"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-sm text-foreground">{run.pipeline_id}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground/80">{run.run_id}</div>
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
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
