import Link from "next/link"
import { Cpu, Server } from "lucide-react"

import { MlopsEmptyState } from "@/components/mlops/layout"
import type { RunItem } from "@/lib/api"
import { normalizeStatus } from "@/lib/status-style"

type WorkersWidgetProps = {
  runs: RunItem[]
}

export function WorkersWidget({ runs }: WorkersWidgetProps) {
  const running = runs.filter((run) => normalizeStatus(run.status) === "RUNNING")

  const hosts = new Map<string, { count: number; gpu?: string }>()
  for (const run of running) {
    const host = run.environment?.hostname?.trim() || "unknown"
    const existing = hosts.get(host) ?? { count: 0, gpu: run.environment?.gpu_name ?? undefined }
    hosts.set(host, {
      count: existing.count + 1,
      gpu: existing.gpu || run.environment?.gpu_name || undefined,
    })
  }

  const hostRows = [...hosts.entries()].sort((a, b) => b[1].count - a[1].count)

  if (running.length === 0) {
    return (
      <MlopsEmptyState
        icon={Server}
        title="No active workers"
        description="Worker hosts appear when runs are executing."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active runs</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{running.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hosts</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{hostRows.length}</div>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {hostRows.slice(0, 6).map(([host, meta]) => (
          <li
            key={host}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-foreground">{host}</div>
                {meta.gpu ? (
                  <div className="truncate text-[10px] text-muted-foreground">{meta.gpu}</div>
                ) : null}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-primary">
              {meta.count}
            </span>
          </li>
        ))}
      </ul>

      <Link href="/tasks" className="text-[10px] text-primary hover:text-primary/80">
        Open tasks →
      </Link>
    </div>
  )
}
