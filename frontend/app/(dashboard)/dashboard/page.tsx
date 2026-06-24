"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  ArrowUpRight,
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
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style"
import { cn, formatApiClientError, formatRelativeTime } from "@/lib/utils"

const statIcons = [Database, GitBranch, Play, Box]

const statSpans = [
  "md:col-span-7",
  "md:col-span-5",
  "md:col-span-4",
  "md:col-span-8",
]

function PanelShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("bezel-shell h-full", className)}>
      <div className="bezel-inner h-full p-5 sm:p-6">{children}</div>
    </div>
  )
}

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
          <div className="mx-auto flex max-w-7xl flex-col gap-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {stats.map((stat, i) => {
                const Icon = statIcons[i] ?? Database
                const isFeatured = i === 0

                return (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className={cn(
                      "group transition-premium hover:-translate-y-0.5",
                      statSpans[i] ?? "md:col-span-6",
                    )}
                  >
                    <div className="bezel-shell h-full">
                      <div
                        className={cn(
                          "bezel-inner flex h-full flex-col justify-between p-5 shadow-diffused transition-premium group-hover:shadow-diffused sm:p-6",
                          isFeatured && "min-h-[148px]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                              <Icon
                                strokeWidth={1.75}
                                className="h-4 w-4 text-primary"
                              />
                            </span>
                            <div>
                              <div className="text-sm font-medium text-muted-foreground">
                                {stat.label}
                              </div>
                              <div
                                className={cn(
                                  "font-semibold tabular-nums tracking-tight text-foreground",
                                  isFeatured
                                    ? "text-4xl leading-none"
                                    : "text-3xl leading-none",
                                )}
                              >
                                {stat.value}
                              </div>
                            </div>
                          </div>
                          <ArrowUpRight
                            strokeWidth={1.75}
                            className="h-4 w-4 shrink-0 text-muted-foreground transition-premium group-hover:text-primary"
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {"ready" in stat && (
                            <span className="font-medium text-[color:var(--status-success-fg)]">
                              {stat.ready} with rows
                            </span>
                          )}

                          {"blocked" in stat &&
                            typeof stat.blocked === "number" &&
                            stat.blocked > 0 && (
                              <span className="font-medium text-[color:var(--status-pending-fg)]">
                                {stat.blocked} blocked readiness
                              </span>
                            )}

                          {"running" in stat &&
                            typeof stat.running === "number" &&
                            stat.running > 0 && (
                              <span className="font-medium text-[color:var(--status-running-fg)]">
                                {stat.running} running
                              </span>
                            )}

                          {"failed" in stat &&
                            typeof stat.failed === "number" &&
                            stat.failed > 0 && (
                              <span className="font-medium text-[color:var(--status-failed-fg)]">
                                {stat.failed} failed
                              </span>
                            )}

                          {"registered" in stat && (
                            <span className="font-medium text-primary">
                              {stat.registered} in registry
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            {showProjectUsage || showTenantUsage ? (
              <PanelShell>
                <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <Activity strokeWidth={1.75} className="h-4 w-4 text-primary" />
                  Resource attribution
                  <span className="text-xs font-normal text-muted-foreground">· last 30 days</span>
                </h3>
                {showProjectUsage ? (
                  <UsageRollupPanel
                    mode="project"
                    tenantId={tenantId}
                    projectId={projectId}
                    token={token}
                    days={30}
                  />
                ) : (
                  <UsageRollupPanel mode="tenant" tenantId={tenantId} token={token} days={30} />
                )}
              </PanelShell>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <PanelShell className="xl:col-span-3">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin text-primary"
                  />
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
                  <ul className="divide-y divide-border/70">
                    {runningPipelines.slice(0, 6).map((p) => (
                      <li key={p.pipeline_id} className="py-3 first:pt-0">
                        <Link
                          href={`/pipelines/${encodeURIComponent(
                            p.pipeline_id,
                          )}`}
                          className="group flex items-center justify-between gap-3 font-mono text-sm text-foreground transition-premium hover:text-primary"
                        >
                          <span className="truncate">{p.pipeline_id}</span>
                          <ArrowUpRight
                            strokeWidth={1.75}
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-premium group-hover:opacity-100 group-hover:text-primary"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelShell>

              <PanelShell className="xl:col-span-2">
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
                  <ul className="divide-y divide-border/70">
                    {failedRuns.slice(0, 5).map((r) => (
                      <li
                        key={r.run_id}
                        className="flex items-center justify-between gap-2 py-3 first:pt-0"
                      >
                        <Link
                          href={`/runs/${encodeURIComponent(r.run_id)}`}
                          className="truncate font-mono text-sm text-[color:var(--status-failed-fg)] transition-premium hover:underline"
                        >
                          {r.pipeline_id || r.run_id}
                        </Link>

                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatRelativeTime(
                            r.updated_at || r.created_at,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelShell>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PanelShell>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                    <History
                      strokeWidth={1.75}
                      className="h-4 w-4 text-muted-foreground"
                    />
                    Recent lifecycle events
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
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                    Merged workspace scopes (API limits apply).
                  </p>
                ) : null}

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
                  <div className="divide-y divide-border/70">
                    {(auditQ.data?.items ?? []).map((event, i) => {
                      const href = auditResourceHref(event)

                      const inner = (
                        <>
                          <Clock
                            strokeWidth={1.75}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />

                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm text-foreground",
                                href && "group-hover:text-primary",
                              )}
                            >
                              {auditEventTitle(event)}
                            </p>

                            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              {formatRelativeTime(event.ts)}
                            </p>
                          </div>
                        </>
                      )

                      return href ? (
                        <Link
                          key={`${event.ts}-${event.resource_id}-${i}`}
                          href={href}
                          className="group flex items-start gap-3 py-3.5 transition-premium first:pt-0 last:pb-0"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div
                          key={`${event.ts}-${event.resource_id}-${i}`}
                          className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                )}
              </PanelShell>

              <PanelShell>
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
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 transition-premium hover:border-border hover:bg-card hover:shadow-whisper active:scale-[0.995]"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-sm text-foreground">
                            {run.pipeline_id}
                          </div>

                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {run.run_id}
                          </div>
                        </div>

                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
                            statusBadgeClass(run.status),
                          )}
                        >
                          {normalizeStatus(run.status)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </PanelShell>
            </div>
          </div>
        )}
      </PageScrollBody>
    </div>
  )
}
