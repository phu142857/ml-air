"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  Activity,
  Box,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  History,
  Loader2,
  Network,
  Play,
  TrendingUp,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import {
  MlopsEmptyState,
  PageScrollBody,
  ResourcePageHeader,
  ScopePinnedInline,
} from "@/components/mlops/layout"
import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { UsageRollupPanel } from "@/components/mlops/usage-rollup-panel"

import { useDashboardStats } from "@/hooks/use-dashboard-stats"

import { fetchAuditTimeline, fetchAuditTimelinePage } from "@/lib/api"
import { useAppContext } from "@/lib/app-context"
import { auditEventTitle, auditResourceHref } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_DASHBOARD } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { StatusBadge } from "@/components/mlops/status-badge"
import { cn, formatApiClientError, formatRelativeTime } from "@/lib/utils"

const statIcons = [Database, GitBranch, Play, Box]

const statSpans = [
  "md:col-span-7",
  "md:col-span-5",
  "md:col-span-4",
  "md:col-span-8",
]

export default function DashboardPage() {
  const { tenantId, projectId, token } = useAppContext()

  const scopePinned = isScopePinned(tenantId, projectId)
  const showProjectUsage = scopePinned
  const showTenantUsage = !scopePinned && tenantId !== "all"

  const {
    isLoading,
    isAggregate,
    stats,
    runningPipelines,
    failedRuns,
    runs,
  } = useDashboardStats()

  const auditQ = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, {}),
    queryFn: async () => {
      if (scopePinned) {
        const page = await fetchAuditTimelinePage(tenantId, projectId, token, { limit: 12 });
        return { items: page.items };
      }
      return fetchAuditTimeline(tenantId, projectId, token, { limit: 12 });
    },
    enabled: Boolean(token?.trim()),
  })

  const recentRuns = [...runs]
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime()
      const tb = new Date(b.updated_at || b.created_at || 0).getTime()

      return tb - ta
    })
    .slice(0, 5)

  const scopeSubtitle = isAggregate
    ? "Cross-project overview"
    : "Stats and recent activity"

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Network}
        accent="sky"
        title="Dashboard"
        subtitle={scopeSubtitle}
      />

      <PageScrollBody
        header={
          isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DASHBOARD} /> : null
        }
      >
        {isLoading ? (
          <ListTableSkeleton rows={4} />
        ) : (
          <div className="flex w-full flex-col gap-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {stats.map((stat, i) => {
                const Icon = statIcons[i] ?? Database
                const isFeatured = i === 0

                return (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className={cn(
                      "group transition-default",
                      statSpans[i] ?? "md:col-span-6",
                    )}
                  >
                    <Panel interactive className={cn("h-full", isFeatured && "min-h-[148px]")}>
                      <div className="flex h-full flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-default">
                              <Icon
                                strokeWidth={1.75}
                                className="h-4 w-4 text-primary"
                              />
                            </span>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-default group-hover:text-foreground/70">
                                {stat.label}
                              </div>
                              <div
                                className={cn(
                                  "font-bold tabular-nums tracking-tight text-foreground",
                                  isFeatured
                                    ? "text-4xl leading-tight"
                                    : "text-3xl leading-tight",
                                )}
                              >
                                {stat.value.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <TrendingUp
                            strokeWidth={1.75}
                            className="h-4 w-4 shrink-0 text-[color:var(--status-success-fg)] opacity-0 transition-default group-hover:opacity-100"
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-xs">
                          {"ready" in stat && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-success-bg)] px-2.5 py-1 font-medium text-[color:var(--status-success-fg)] ring-1 ring-[color:var(--status-success-border)]">
                              <CheckCircle2 className="h-3 w-3" />
                              {stat.ready} ready
                            </span>
                          )}

                          {"blocked" in stat &&
                            typeof stat.blocked === "number" &&
                            stat.blocked > 0 && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium",
                                  "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
                                )}
                              >
                                <AlertCircle className="h-3 w-3" />
                                {stat.blocked} blocked
                              </span>
                            )}

                          {"running" in stat &&
                            typeof stat.running === "number" &&
                            stat.running > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-running-bg)] px-2.5 py-1 font-medium text-[color:var(--status-running-fg)] ring-1 ring-[color:var(--status-running-border)]">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {stat.running} running
                              </span>
                            )}

                          {"failed" in stat &&
                            typeof stat.failed === "number" &&
                            stat.failed > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-failed-bg)] px-2.5 py-1 font-medium text-[color:var(--status-failed-fg)] ring-1 ring-[color:var(--status-failed-border)]">
                                <AlertCircle className="h-3 w-3" />
                                {stat.failed} failed
                              </span>
                            )}

                          {"registered" in stat && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary ring-1 ring-primary/20">
                              <Zap className="h-3 w-3" />
                              {stat.registered} registered
                            </span>
                          )}
                        </div>
                      </div>
                    </Panel>
                  </Link>
                )
              })}
            </div>

            {showProjectUsage || showTenantUsage ? (
              <Panel>
                <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <Activity strokeWidth={1.75} className="h-4 w-4 text-primary" />
                  Resource usage
                </h3>
              </Panel>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <Panel className="xl:col-span-3">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin text-primary"
                  />
                  Active pipelines
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
                      <li key={p.pipeline_id} className="group rounded-lg border border-border bg-muted/20 p-3 transition-default hover:border-primary/30 hover:bg-primary/5">
                        <Link
                          href={`/pipelines/${encodeURIComponent(
                            p.pipeline_id,
                          )}`}
                          className="flex items-center justify-between gap-3 transition-default"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground transition-default group-hover:text-primary">{p.pipeline_id}</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">Pipeline running</div>
                          </div>
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--status-running-bg)]">
                            <Loader2
                              strokeWidth={2}
                              className="h-3 w-3 animate-spin text-[color:var(--status-running-fg)]"
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel className="xl:col-span-2">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <AlertCircle
                    strokeWidth={1.75}
                    className="h-4 w-4 text-[color:var(--status-failed-fg)]"
                  />
                  Failed runs
                </h3>

                {failedRuns.length === 0 ? (
                  <MlopsEmptyState
                    icon={CheckCircle2}
                    title="All clear"
                    description="No failed runs in this scope."
                    className="border-0 bg-transparent p-0 [&_svg]:text-[color:var(--status-success-fg)]"
                  />
                ) : (
                  <ul className="space-y-2">
                    {failedRuns.slice(0, 5).map((r) => (
                      <li
                        key={r.run_id}
                        className="group rounded-lg border border-[color:var(--status-failed-border)]/50 bg-[color:var(--status-failed-bg)]/30 p-3 transition-default hover:border-[color:var(--status-failed-border)] hover:bg-[color:var(--status-failed-bg)]/50"
                      >
                        <Link
                          href={`/runs/${encodeURIComponent(r.run_id)}`}
                          className="flex items-center justify-between gap-2 transition-default"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[color:var(--status-failed-fg)] group-hover:underline">
                              {r.pipeline_id || r.run_id}
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {formatRelativeTime(r.updated_at || r.created_at)}
                            </div>
                          </div>
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--status-failed-fg)]/10">
                            <AlertCircle strokeWidth={2} className="h-3 w-3 text-[color:var(--status-failed-fg)]" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                    <History
                      strokeWidth={1.75}
                      className="h-4 w-4 text-muted-foreground"
                    />
                    Lifecycle events
                  </h3>

                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/lifecycle">View all</Link>
                  </Button>
                </div>

                {!scopePinned ? (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Merged workspace scopes (API limits apply).
                  </p>
                ) : null}

                <div className="mt-5">
                  {auditQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Loading
                    </div>
                  ) : auditQ.isError ? (
                    <p className="text-sm text-[color:var(--status-failed-fg)]">
                      {formatApiClientError(auditQ.error)}
                    </p>
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
                    <ul className="space-y-2">
                      {(auditQ.data?.items ?? []).map((event, i) => {
                        const href = auditResourceHref(event)

                        const inner = (
                          <>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                              <Clock
                                strokeWidth={1.75}
                                className="h-4 w-4 text-muted-foreground"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className={cn("text-sm font-medium text-foreground", href && "transition-default group-hover:text-primary")}>
                                {auditEventTitle(event)}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {formatRelativeTime(event.ts)}
                              </p>
                            </div>
                          </>
                        )

                        return href ? (
                          <Link
                            key={`${event.ts}-${event.resource_id}-${i}`}
                            href={href}
                            className="group flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-default hover:border-primary/30 hover:bg-primary/5"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div
                            key={`${event.ts}-${event.resource_id}-${i}`}
                            className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3"
                          >
                            {inner}
                          </div>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                    <Play
                      strokeWidth={1.75}
                      className="h-4 w-4 text-muted-foreground"
                    />
                    Recent runs
                  </h3>

                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/runs">View all</Link>
                  </Button>
                </div>

                {recentRuns.length === 0 ? (
                  <MlopsEmptyState
                    icon={Play}
                    title="No runs yet"
                    description="Pipeline runs in this scope will appear here."
                    className="border-0 bg-transparent p-0"
                  />
                ) : (
                  <div className="space-y-2.5">
                    {recentRuns.map((run) => (
                      <Link
                        key={run.run_id}
                        href={`/runs/${encodeURIComponent(run.run_id)}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3 transition-default hover:border-border hover:bg-card"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-sm text-foreground">
                            {run.pipeline_id}
                          </div>

                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {run.run_id}
                          </div>
                        </div>

                        <StatusBadge value={run.status} size="sm" />
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}
      </PageScrollBody>
    </div>
  )
}
