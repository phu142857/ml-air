import type { DashboardLayoutItem } from "./types"

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutItem[] = [
  { id: "active-runs", x: 0, y: 0, w: 5, h: 3, visible: true },
  { id: "pipeline-health", x: 5, y: 0, w: 4, h: 3, visible: true },
  { id: "gpu-usage", x: 9, y: 0, w: 3, h: 3, visible: true },
  { id: "queue", x: 0, y: 3, w: 3, h: 2, visible: true },
  { id: "workers", x: 3, y: 3, w: 3, h: 2, visible: true },
  { id: "storage", x: 6, y: 3, w: 6, h: 3, visible: true },
  { id: "recent-traces", x: 0, y: 6, w: 5, h: 3, visible: true },
  { id: "alerts", x: 5, y: 6, w: 7, h: 3, visible: true },
]
