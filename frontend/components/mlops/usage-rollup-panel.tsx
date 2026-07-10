"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Activity, ArrowUpRight, Loader2 } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { MetadataGrid, MlopsEmptyState } from "@/components/mlops/layout"
import {
  fetchProjectUsage,
  fetchTenantUsage,
  type ProjectUsageRollupItem,
  type RunUsageRollupItem,
  type UsageSummaryRecord,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import {
  formatAvgPeak,
  formatBytes,
  formatMemoryUsage,
  formatPct,
  formatRuntimeSeconds,
} from "@/lib/usage-format"
import { formatApiClientError } from "@/lib/utils"

type UsageRollupPanelProps = {
  tenantId: string
  projectId?: string
  token: string
  mode: "project" | "tenant"
  days?: number
}

function UsageTotals({ usage }: { usage: UsageSummaryRecord }) {
  return (
    <div className="space-y-4">
      <MetadataGrid
        columns={2}
        items={[
          { label: "Runtime", value: formatRuntimeSeconds(usage.runtime_seconds) },
          { label: "CPU time", value: formatRuntimeSeconds(usage.cpu_seconds) },
          { label: "GPU time", value: formatRuntimeSeconds(usage.gpu_seconds) },
          { label: "Tasks", value: String(usage.task_count ?? "—") },
        ]}
      />
      <MetadataGrid
        columns={2}
        items={[
          {
            label: "CPU util",
            value: formatAvgPeak(usage.cpu_pct_avg, usage.cpu_pct_peak, formatPct),
          },
          {
            label: "Memory",
            value: formatMemoryUsage(usage.memory_mb_avg, usage.memory_mb_peak, usage.memory_rss_peak_kb),
          },
          {
            label: "Disk read",
            value: formatBytes(usage.disk_read_bytes),
          },
          {
            label: "Disk write",
            value: formatBytes(usage.disk_write_bytes),
          },
        ]}
      />
    </div>
  )
}

function TopRunsTable({ runs }: { runs: RunUsageRollupItem[] }) {
  if (runs.length === 0) return null
  const columns: DataTableColumn<RunUsageRollupItem>[] = [
    {
      id: "run",
      header: "Run",
      width: 260,
      canHide: false,
      getSearchValue: (row) => row.run_id,
      getSortValue: (row) => row.run_id,
      cell: (row) => (
        <Link
          href={`/runs/${encodeURIComponent(row.run_id)}`}
          className="group inline-flex max-w-full items-center gap-1 font-mono text-xs text-primary hover:text-primary/80"
        >
          <span className="truncate">{row.run_id}</span>
          <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
        </Link>
      ),
    },
    {
      id: "gpu",
      header: "GPU",
      width: 110,
      align: "right",
      getSortValue: (row) => row.gpu_seconds,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatRuntimeSeconds(row.gpu_seconds)}</span>
      ),
    },
    {
      id: "runtime",
      header: "Runtime",
      width: 120,
      align: "right",
      getSortValue: (row) => row.runtime_seconds,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatRuntimeSeconds(row.runtime_seconds)}</span>
      ),
    },
    {
      id: "tasks",
      header: "Tasks",
      width: 80,
      align: "right",
      getSortValue: (row) => row.task_count ?? 0,
      cell: (row) => (
        <span className="text-xs tabular-nums">{row.task_count ?? "—"}</span>
      ),
    },
  ]
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top runs by GPU time</p>
      <DataTable
        tableId="usage-top-runs"
        title="Top runs"
        description="Runs with highest GPU time in the window."
        columns={columns}
        data={runs}
        keyExtractor={(row) => row.run_id}
      />
    </div>
  )
}

function ProjectsTable({ projects }: { projects: ProjectUsageRollupItem[] }) {
  if (projects.length === 0) return null
  const columns: DataTableColumn<ProjectUsageRollupItem>[] = [
    {
      id: "project",
      header: "Project",
      width: 220,
      canHide: false,
      getSearchValue: (row) => row.project_id,
      getSortValue: (row) => row.project_id,
      cell: (row) => <span className="font-mono text-xs">{row.project_id}</span>,
    },
    {
      id: "runs",
      header: "Runs",
      width: 90,
      align: "right",
      getSortValue: (row) => row.run_count,
      cell: (row) => <span className="text-xs tabular-nums">{row.run_count}</span>,
    },
    {
      id: "gpu",
      header: "GPU time",
      width: 130,
      align: "right",
      getSortValue: (row) => row.usage?.gpu_seconds ?? 0,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatRuntimeSeconds(row.usage?.gpu_seconds)}
        </span>
      ),
    },
    {
      id: "runtime",
      header: "Runtime",
      width: 130,
      align: "right",
      getSortValue: (row) => row.usage?.runtime_seconds ?? 0,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatRuntimeSeconds(row.usage?.runtime_seconds)}
        </span>
      ),
    },
  ]
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By project</p>
      <DataTable
        tableId="usage-projects"
        title="Projects"
        description="Project-level usage breakdown."
        columns={columns}
        data={projects}
        keyExtractor={(row) => row.project_id}
      />
    </div>
  )
}

export function UsageRollupPanel({
  tenantId,
  projectId,
  token,
  mode,
  days = 30,
}: UsageRollupPanelProps) {
  const projectQuery = useQuery({
    queryKey: mlairKeys.usage.project(tenantId, projectId ?? "", days),
    queryFn: () => fetchProjectUsage(tenantId, projectId!, token, { days }),
    enabled: mode === "project" && Boolean(tenantId && projectId && token),
  })

  const tenantQuery = useQuery({
    queryKey: mlairKeys.usage.tenant(tenantId, days),
    queryFn: () => fetchTenantUsage(tenantId, token, { days }),
    enabled: mode === "tenant" && Boolean(tenantId && token),
  })

  const query = mode === "project" ? projectQuery : tenantQuery
  const windowLabel = `${days}d`

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading resource rollup…
      </div>
    )
  }

  if (query.isError) {
    return <p className="text-sm text-[color:var(--status-failed-fg)]">{formatApiClientError(query.error)}</p>
  }

  const enabled = query.data?.enabled ?? true
  if (!enabled) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="Usage tracking disabled"
        description="Enable ML_AIR_USAGE_TRACKING_ENABLED to collect resource attribution."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  const usage = query.data?.usage
  const runCount = query.data?.run_count ?? 0

  if (!usage || runCount === 0) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="No resource usage in window"
        description={`No completed runs with usage data in the last ${windowLabel}.`}
        className="border-0 bg-transparent p-0"
      />
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {runCount} run{runCount === 1 ? "" : "s"} · last {windowLabel}
        {mode === "project" && projectId ? (
          <span>
            {" "}
            · <span className="font-mono">{tenantId}/{projectId}</span>
          </span>
        ) : (
          <span>
            {" "}
            · tenant <span className="font-mono">{tenantId}</span>
          </span>
        )}
      </p>
      <UsageTotals usage={usage} />
      {mode === "project" && projectQuery.data?.runs ? (
        <TopRunsTable runs={projectQuery.data.runs} />
      ) : null}
      {mode === "tenant" && tenantQuery.data?.projects ? (
        <ProjectsTable projects={tenantQuery.data.projects} />
      ) : null}
    </div>
  )
}
