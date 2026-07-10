import { Database } from "lucide-react"

import { UsageRollupPanel } from "@/components/mlops/usage-rollup-panel"
import { MlopsEmptyState } from "@/components/mlops/layout"
import type { DatasetItem } from "@/lib/api"

type StorageWidgetProps = {
  datasets: DatasetItem[]
  tenantId: string
  projectId: string
  token: string
  showProjectUsage: boolean
  showTenantUsage: boolean
}

export function StorageWidget({
  datasets,
  tenantId,
  projectId,
  token,
  showProjectUsage,
  showTenantUsage,
}: StorageWidgetProps) {
  const totalRows = datasets.reduce((sum, dataset) => sum + (dataset.current_size ?? 0), 0)
  const withData = datasets.filter((dataset) => (dataset.current_size ?? 0) > 0).length

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Database className="h-3 w-3" />
            Datasets
          </div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{datasets.length}</div>
          <div className="text-[10px] text-muted-foreground">{withData} with rows</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Row volume</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {totalRows.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground">tracked rows</div>
        </div>
      </div>

      {showProjectUsage ? (
        <div className="min-h-0 flex-1 overflow-auto border-t border-border/60 pt-3">
          <UsageRollupPanel
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            mode="project"
            days={30}
          />
        </div>
      ) : showTenantUsage ? (
        <div className="min-h-0 flex-1 overflow-auto border-t border-border/60 pt-3">
          <UsageRollupPanel tenantId={tenantId} token={token} mode="tenant" days={30} />
        </div>
      ) : (
        <MlopsEmptyState
          icon={Database}
          title="Pin scope for usage"
          description="Pin tenant and project to see disk I/O rollup."
          className="border-0 bg-transparent p-0"
        />
      )}

      <p className="text-[10px] text-muted-foreground">
        Disk metrics from usage rollup when scope is pinned.
      </p>
    </div>
  )
}
