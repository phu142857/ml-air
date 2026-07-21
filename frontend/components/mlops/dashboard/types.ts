export const DASHBOARD_WIDGET_IDS = [
  "active-runs",
  "queue",
  "workers",
  "storage",
  "recent-traces",
  "alerts",
  "pipeline-health",
  "gpu-usage",
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

export type DashboardLayoutItem = {
  id: DashboardWidgetId
  x: number
  y: number
  w: number
  h: number
  visible: boolean
}

export type DashboardLayoutState = {
  items: DashboardLayoutItem[]
}

export const DASHBOARD_COLS = 12
export const DASHBOARD_ROW_HEIGHT_PX = 72
export const DASHBOARD_GRID_GAP_PX = 8

export const DASHBOARD_WIDGET_META: Record<
  DashboardWidgetId,
  { title: string; description: string }
> = {
  "active-runs": {
    title: "Active runs",
    description: "Runs currently executing in scope",
  },
  queue: {
    title: "Queue",
    description: "Pending and queued executions",
  },
  workers: {
    title: "Workers",
    description: "Execution hosts and parallelism",
  },
  storage: {
    title: "Storage",
    description: "Dataset volume and disk I/O",
  },
  "recent-traces": {
    title: "Recent traces",
    description: "Latest distributed traces",
  },
  alerts: {
    title: "Alerts",
    description: "Failures, blocks, and lifecycle signals",
  },
  "pipeline-health": {
    title: "Pipeline health",
    description: "Running pipelines and throughput",
  },
  "gpu-usage": {
    title: "GPU usage",
    description: "GPU time and utilization rollup",
  },
}
