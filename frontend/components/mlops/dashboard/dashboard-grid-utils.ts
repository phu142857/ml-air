import {
  DASHBOARD_COLS,
  DASHBOARD_GRID_GAP_PX,
  DASHBOARD_ROW_HEIGHT_PX,
  type DashboardLayoutItem,
} from "./types"

export const DASHBOARD_EDIT_EXTRA_ROWS = 2

export function buildDashboardGridStyle(rowCount: number) {
  return {
    gap: `${DASHBOARD_GRID_GAP_PX}px`,
    gridTemplateColumns: `repeat(${DASHBOARD_COLS}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rowCount}, ${DASHBOARD_ROW_HEIGHT_PX}px)`,
  } as const
}

export function isGridCellOccupied(
  col: number,
  row: number,
  items: DashboardLayoutItem[],
  excludeId?: string,
): boolean {
  return items.some((item) => {
    if (!item.visible || item.id === excludeId) return false
    return (
      col >= item.x &&
      col < item.x + item.w &&
      row >= item.y &&
      row < item.y + item.h
    )
  })
}

export function gridRowCount(items: DashboardLayoutItem[], editMode: boolean): number {
  const visible = items.filter((item) => item.visible)
  const maxRow = visible.reduce((max, item) => Math.max(max, item.y + item.h), 6)
  return editMode ? maxRow + DASHBOARD_EDIT_EXTRA_ROWS : maxRow
}
