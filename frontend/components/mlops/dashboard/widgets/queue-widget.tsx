import Link from "next/link"
import { Clock } from "lucide-react"

import { MlopsEmptyState } from "@/components/mlops/layout"
import { StatusBadge } from "@/components/mlops/status-badge"
import type { RunItem } from "@/lib/api"
import { normalizeStatus } from "@/lib/status-style"
import { formatRelativeTime } from "@/lib/utils"

type QueueWidgetProps = {
  runs: RunItem[]
}

export function QueueWidget({ runs }: QueueWidgetProps) {
  const queued = runs
    .filter((run) => {
      const status = normalizeStatus(run.status)
      return status === "QUEUED" || status === "PENDING"
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime()
      const tb = new Date(b.created_at || 0).getTime()
      return ta - tb
    })

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
          {queued.length}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          waiting
        </span>
      </div>

      {queued.length === 0 ? (
        <MlopsEmptyState
          icon={Clock}
          title="Queue empty"
          className="border-0 bg-transparent p-0"
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto">
          {queued.slice(0, 6).map((run) => (
            <li key={run.run_id}>
              <Link
                href={`/runs/${encodeURIComponent(run.run_id)}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--status-pending-border)]/40 bg-[color:var(--status-pending-bg)]/20 px-2.5 py-1.5 text-xs transition-default hover:border-[color:var(--status-pending-border)]"
              >
                <span className="min-w-0 truncate font-mono">{run.pipeline_id}</span>
                <StatusBadge value={run.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
