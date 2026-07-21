/** DataTable performance helpers (Sprint 2.4) — client-side only. */

import type { DataTableDensity } from "@/lib/data-table-density"

/** Virtualize body rows when a page has at least this many rows. */
export const DATA_TABLE_VIRTUAL_THRESHOLD = 40

/** Extra rows rendered above/below the viewport. */
export const DATA_TABLE_VIRTUAL_OVERSCAN = 8

/** Estimated row heights by density (matches `DENSITY_ROW_CLASS` padding). */
export const DATA_TABLE_ROW_HEIGHT_PX: Record<DataTableDensity, number> = {
  compact: 36,
  comfortable: 44,
  spacious: 56,
}

export type DataTableVirtualWindow = {
  startIndex: number
  endIndex: number
  offsetTop: number
  offsetBottom: number
}

export function estimateRowHeight(density: DataTableDensity): number {
  return DATA_TABLE_ROW_HEIGHT_PX[density] ?? DATA_TABLE_ROW_HEIGHT_PX.comfortable
}

export function shouldVirtualizeRows(
  rowCount: number,
  enabled: boolean | "auto" = "auto",
  threshold = DATA_TABLE_VIRTUAL_THRESHOLD,
): boolean {
  if (enabled === false) return false
  if (enabled === true) return rowCount > 0
  return rowCount >= threshold
}

/**
 * Compute a spacer-based window for `<tbody>` virtualization.
 * Uses fixed estimated row heights (good enough for dense ops tables).
 */
export function computeVirtualWindow(options: {
  rowCount: number
  rowHeight: number
  scrollTop: number
  viewportHeight: number
  overscan?: number
}): DataTableVirtualWindow {
  const {
    rowCount,
    rowHeight,
    scrollTop,
    viewportHeight,
    overscan = DATA_TABLE_VIRTUAL_OVERSCAN,
  } = options

  if (rowCount <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, offsetBottom: 0 }
  }

  const safeViewport = Math.max(viewportHeight, rowHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(safeViewport / rowHeight) + overscan * 2
  const endIndex = Math.min(rowCount, startIndex + visibleCount)
  const offsetTop = startIndex * rowHeight
  const offsetBottom = Math.max(0, (rowCount - endIndex) * rowHeight)

  return { startIndex, endIndex, offsetTop, offsetBottom }
}
