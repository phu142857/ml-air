import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Box,
  Database,
  GitBranch,
  Loader2,
  Play,
  TrendingUp,
} from "lucide-react"

import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

const statIcons = [Database, GitBranch, Play, Box]
const statSpans = ["md:col-span-3", "md:col-span-3", "md:col-span-3", "md:col-span-3"]

export type DashboardKpiStat = {
  label: string
  value: number
  href: string
  ready?: number
  blocked?: number
  running?: number
  failed?: number
  registered?: number
}

type DashboardKpiStripProps = {
  stats: DashboardKpiStat[]
}

export function DashboardKpiStrip({ stats }: DashboardKpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-12">
      {stats.map((stat, index) => {
        const Icon = statIcons[index] ?? Database
        const isFeatured = index === 0

        return (
          <Link
            key={stat.label}
            href={stat.href}
            className={cn("group transition-default", statSpans[index] ?? "md:col-span-3")}
          >
            <Panel interactive className="h-full p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon strokeWidth={1.75} className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {stat.label}
                    </div>
                    <div
                      className={cn(
                        "font-bold tabular-nums tracking-tight text-foreground",
                        isFeatured ? "text-3xl leading-none" : "text-2xl leading-none",
                      )}
                    >
                      {stat.value.toLocaleString()}
                    </div>
                  </div>
                </div>
                <TrendingUp
                  strokeWidth={1.75}
                  className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-success-fg)] opacity-0 transition-default group-hover:opacity-100"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {typeof stat.ready === "number" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-success-bg)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-success-fg)] ring-1 ring-[color:var(--status-success-border)]">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {stat.ready} ready
                  </span>
                ) : null}
                {typeof stat.blocked === "number" && stat.blocked > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-failed-fg)]">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {stat.blocked} blocked
                  </span>
                ) : null}
                {typeof stat.running === "number" && stat.running > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-running-bg)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-running-fg)] ring-1 ring-[color:var(--status-running-border)]">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {stat.running} running
                  </span>
                ) : null}
                {typeof stat.failed === "number" && stat.failed > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--status-failed-bg)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-failed-fg)] ring-1 ring-[color:var(--status-failed-border)]">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {stat.failed} failed
                  </span>
                ) : null}
                {typeof stat.registered === "number" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/20">
                    {stat.registered} registered
                  </span>
                ) : null}
              </div>
            </Panel>
          </Link>
        )
      })}
    </div>
  )
}
