"use client"

import Link from "next/link"
import { AlertCircle, Box, GitBranch, User } from "lucide-react"

import type { EventInsights } from "@/lib/event-explorer"
import { cn, formatRelativeTime } from "@/lib/utils"

type EventInsightsSidebarProps = {
  insights: EventInsights
  className?: string
}

function InsightList({
  title,
  rows,
  icon: Icon,
}: {
  title: string
  rows: EventInsights["topActors"]
  icon: React.ElementType
}) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={`${title}-${row.label}`}>
            {row.href ? (
              <Link
                href={row.href}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs transition-default hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="min-w-0 truncate text-foreground/90">{row.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{row.count}</span>
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
                <span className="min-w-0 truncate text-foreground/90">{row.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{row.count}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function EventInsightsSidebar({ insights, className }: EventInsightsSidebarProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Event insights</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Aggregated from loaded events</p>
      </div>

      <InsightList title="Top actors" rows={insights.topActors} icon={User} />
      <InsightList title="Most active resources" rows={insights.activeResources} icon={Box} />
      <InsightList title="Frequent event types" rows={insights.frequentTypes} icon={GitBranch} />
      <InsightList title="Top pipelines" rows={insights.topPipelines} icon={GitBranch} />
      <InsightList title="Top models" rows={insights.topModels} icon={Box} />

      {insights.recentFailed.length > 0 ? (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-[color:var(--status-failed-fg)]" />
            Recent failed
          </h3>
          <ul className="space-y-1.5">
            {insights.recentFailed.map((event) => (
              <li key={event.id}>
                {event.resource.href ? (
                  <Link
                    href={event.resource.href}
                    className="block rounded-md border border-[color:var(--status-failed-border)]/50 bg-[color:var(--status-failed-bg)]/20 px-2.5 py-2 transition-default hover:border-[color:var(--status-failed-border)]"
                  >
                    <p className="truncate text-xs font-medium text-[color:var(--status-failed-fg)]">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {event.actor.name} · {formatRelativeTime(event.timestamp)}
                    </p>
                  </Link>
                ) : (
                  <div className="rounded-md border border-[color:var(--status-failed-border)]/50 bg-[color:var(--status-failed-bg)]/20 px-2.5 py-2">
                    <p className="truncate text-xs font-medium text-[color:var(--status-failed-fg)]">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {event.actor.name} · {formatRelativeTime(event.timestamp)}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
