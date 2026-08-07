"use client"

import type { ActivityFeedItem, AuditTimelineItem, DatasetItem, PipelineItem, RunItem } from "@/lib/api"

import {
  DashboardCustomizeMenu,
  useDashboardDragState,
} from "./dashboard-customize-menu"
import { buildDashboardGridStyle, gridRowCount } from "./dashboard-grid-utils"
import { DashboardGridSkeleton } from "./dashboard-grid-skeleton"
import { DashboardWidgetShell } from "./dashboard-widget-shell"
import { useDashboardLayout } from "./use-dashboard-layout"
import type { DashboardWidgetId } from "./types"
import { ActiveRunsWidget } from "./widgets/active-runs-widget"
import { AlertsWidget } from "./widgets/alerts-widget"
import { GpuUsageWidget } from "./widgets/gpu-usage-widget"
import { PipelineHealthWidget } from "./widgets/pipeline-health-widget"
import { QueueWidget } from "./widgets/queue-widget"
import { RecentTracesWidget } from "./widgets/recent-traces-widget"
import { StorageWidget } from "./widgets/storage-widget"
import { WorkersWidget } from "./widgets/workers-widget"

type DashboardBoardProps = {
  runs: RunItem[]
  pipelines: PipelineItem[]
  datasets: DatasetItem[]
  runningPipelines: PipelineItem[]
  failedRuns: RunItem[]
  auditEvents: AuditTimelineItem[]
  activityItems?: ActivityFeedItem[]
  useActivityFeed?: boolean
  auditLoading: boolean
  auditError?: string
  blockedReadinessCount: number
  tenantId: string
  projectId: string
  token: string
  scopePinned: boolean
  showProjectUsage: boolean
  showTenantUsage: boolean
}

export function DashboardBoard({
  runs,
  pipelines,
  datasets,
  runningPipelines,
  failedRuns,
  auditEvents,
  activityItems = [],
  useActivityFeed = false,
  auditLoading,
  auditError,
  blockedReadinessCount,
  tenantId,
  projectId,
  token,
  scopePinned,
  showProjectUsage,
  showTenantUsage,
}: DashboardBoardProps) {
  const {
    items,
    editMode,
    setEditMode,
    setVisible,
    resetLayout,
    updateItem,
    swapPositions,
    moveItem,
  } = useDashboardLayout()

  const { dragSourceId, onDragStart, onDragEnd } = useDashboardDragState()

  const visibleItems = items.filter((item) => item.visible)
  const gridRows = gridRowCount(visibleItems, editMode)

  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case "active-runs":
        return <ActiveRunsWidget runs={runs} />
      case "queue":
        return <QueueWidget runs={runs} />
      case "workers":
        return <WorkersWidget runs={runs} />
      case "storage":
        return (
          <StorageWidget
            datasets={datasets}
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            showProjectUsage={showProjectUsage}
            showTenantUsage={showTenantUsage}
          />
        )
      case "recent-traces":
        return (
          <RecentTracesWidget
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            scopePinned={scopePinned}
          />
        )
      case "alerts":
        return (
          <AlertsWidget
            failedRuns={failedRuns}
            auditEvents={auditEvents}
            activityItems={activityItems}
            useActivityFeed={useActivityFeed}
            blockedReadinessCount={blockedReadinessCount}
            scopePinned={scopePinned}
            auditLoading={auditLoading}
            auditError={auditError}
          />
        )
      case "pipeline-health":
        return (
          <PipelineHealthWidget pipelines={pipelines} runningPipelines={runningPipelines} />
        )
      case "gpu-usage":
        return (
          <GpuUsageWidget
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            showProjectUsage={showProjectUsage}
            showTenantUsage={showTenantUsage}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DashboardCustomizeMenu
        items={items}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onVisibleChange={setVisible}
        onReset={resetLayout}
      />

      <div
        data-dashboard-grid
        className="relative grid w-full"
        style={buildDashboardGridStyle(gridRows)}
      >
        {editMode ? (
          <DashboardGridSkeleton
            rowCount={gridRows}
            items={visibleItems}
            dragSourceId={dragSourceId}
            onPlaceAt={moveItem}
            onDragEnd={onDragEnd}
          />
        ) : null}

        {visibleItems.map((item) => (
          <DashboardWidgetShell
            key={item.id}
            item={item}
            editMode={editMode}
            dragSourceId={dragSourceId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOn={(targetId) => {
              if (dragSourceId) swapPositions(dragSourceId, targetId)
              onDragEnd()
            }}
            onResize={(id, w, h) => updateItem(id, { w, h })}
          >
            {renderWidget(item.id)}
          </DashboardWidgetShell>
        ))}
      </div>
    </div>
  )
}
