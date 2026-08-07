import Link from "next/link"
import { AlertCircle, CheckCircle2, Clock, History, Activity } from "lucide-react"

import { MlopsEmptyState } from "@/components/mlops/layout"
import { auditEventTitle, auditResourceHref } from "@/lib/audit-event"
import { activityResourceHref } from "@/lib/activity-feed"
import type { ActivityFeedItem, AuditTimelineItem, RunItem } from "@/lib/api"
import { cn, formatRelativeTime } from "@/lib/utils"

type AlertsWidgetProps = {
  failedRuns: RunItem[]
  auditEvents: AuditTimelineItem[]
  activityItems?: ActivityFeedItem[]
  blockedReadinessCount: number
  scopePinned: boolean
  auditLoading: boolean
  auditError?: string
  useActivityFeed?: boolean
}

export function AlertsWidget({
  failedRuns,
  auditEvents,
  activityItems = [],
  blockedReadinessCount,
  scopePinned,
  auditLoading,
  auditError,
  useActivityFeed = false,
}: AlertsWidgetProps) {
  const alertCount = failedRuns.length + blockedReadinessCount

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
            alertCount > 0
              ? "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]"
              : "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
          )}
        >
          {alertCount > 0 ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {alertCount} alert{alertCount === 1 ? "" : "s"}
        </span>
        {blockedReadinessCount > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {blockedReadinessCount} blocked readiness
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {failedRuns.length > 0 ? (
          <div className="shrink-0">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Failed runs
            </p>
            <ul className="space-y-1.5">
              {failedRuns.map((run) => (
                <li key={run.run_id}>
                  <Link
                    href={`/runs/${encodeURIComponent(run.run_id)}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--status-failed-border)]/50 bg-[color:var(--status-failed-bg)]/25 px-2.5 py-2 transition-default hover:border-[color:var(--status-failed-border)]"
                  >
                    <span className="min-w-0 truncate text-xs font-medium text-[color:var(--status-failed-fg)]">
                      {run.pipeline_id || run.run_id}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(run.updated_at || run.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 border-t border-border/60 pt-2">
          <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {useActivityFeed ? (
                <Activity className="h-3 w-3" />
              ) : (
                <History className="h-3 w-3" />
              )}
              {useActivityFeed ? "Recent activity" : "Lifecycle events"}
            </p>
            <Link
              href={useActivityFeed ? "/activity" : "/lifecycle"}
              className="text-[10px] text-primary hover:text-primary/80"
            >
              View all
            </Link>
          </div>

          {!scopePinned ? (
            <p className="text-xs text-muted-foreground">Merged workspace scopes (API limits apply).</p>
          ) : auditLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              Loading events…
            </div>
          ) : auditError ? (
            <p className="text-xs text-[color:var(--status-failed-fg)]">{auditError}</p>
          ) : useActivityFeed ? (
            activityItems.length === 0 ? (
              <MlopsEmptyState
                icon={Activity}
                title="No activity yet"
                className="border-0 bg-transparent p-0"
              />
            ) : (
              <ul className="space-y-1.5">
                {activityItems.map((item) => {
                  const href = activityResourceHref(item)
                  const inner = (
                    <>
                      <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{item.summary}</p>
                      <p className="font-mono text-[10px] text-muted-foreground/80">
                        {formatRelativeTime(item.ts)}
                      </p>
                    </>
                  )
                  return href ? (
                    <Link
                      key={item.id}
                      href={href}
                      className="block rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 transition-default hover:border-primary/30 hover:bg-primary/5"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2"
                    >
                      {inner}
                    </div>
                  )
                })}
              </ul>
            )
          ) : auditEvents.length === 0 ? (
            <MlopsEmptyState
              icon={History}
              title="No events yet"
              className="border-0 bg-transparent p-0"
            />
          ) : (
            <ul className="space-y-1.5">
              {auditEvents.map((event, index) => {
                const href = auditResourceHref(event)
                const inner = (
                  <>
                    <p className="truncate text-xs font-medium text-foreground">{auditEventTitle(event)}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {formatRelativeTime(event.ts)}
                    </p>
                  </>
                )
                return href ? (
                  <Link
                    key={`${event.ts}-${event.resource_id}-${index}`}
                    href={href}
                    className="block rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 transition-default hover:border-primary/30 hover:bg-primary/5"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={`${event.ts}-${event.resource_id}-${index}`}
                    className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2"
                  >
                    {inner}
                  </div>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
