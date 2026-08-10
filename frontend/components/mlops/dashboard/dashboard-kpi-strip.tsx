import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react"

import { cn } from "@/lib/utils"

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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="group bg-card px-3 py-2.5 transition-default hover:bg-muted/40"
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {stat.label}
          </div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums leading-none text-foreground">
            {stat.value.toLocaleString()}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {typeof stat.ready === "number" ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[color:var(--status-success-fg)]">
                <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />
                {stat.ready} ready
              </span>
            ) : null}
            {typeof stat.blocked === "number" && stat.blocked > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[color:var(--status-failed-fg)]">
                <AlertCircle className="h-2.5 w-2.5" aria-hidden />
                {stat.blocked} blocked
              </span>
            ) : null}
            {typeof stat.running === "number" && stat.running > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[color:var(--status-running-fg)]">
                <Loader2 className="h-2.5 w-2.5 motion-safe-spin" aria-hidden />
                {stat.running} running
              </span>
            ) : null}
            {typeof stat.failed === "number" && stat.failed > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[color:var(--status-failed-fg)]">
                <AlertCircle className="h-2.5 w-2.5" aria-hidden />
                {stat.failed} failed
              </span>
            ) : null}
            {typeof stat.registered === "number" ? (
              <span className="text-[10px] text-primary">{stat.registered} registered</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  )
}
