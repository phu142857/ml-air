/** DataTable workspace personalization (Sprint 2.2) — localStorage only. */

import {
  migrateStoredDensity,
  type DataTableDensity,
} from "@/lib/data-table-density"

export type DataTableSortDirection = "asc" | "desc"

export type DataTableSavedView = {
  id: string
  name: string
  density: DataTableDensity
  pageSize: number
  visibility: Record<string, boolean>
  /** Ordered column ids (visible + hidden). Missing ids append in definition order. */
  columnOrder: string[]
  pinned: string[]
  sorts: Array<{ id: string; direction: DataTableSortDirection }>
  filters: Record<string, string[]>
  columnWidths: Record<string, number>
}

export type DataTableWorkspaceLayout = {
  visibility: Record<string, boolean>
  columnOrder: string[]
  pinned: string[]
  columnWidths: Record<string, number>
}

export type DataTableWorkspaceState = {
  version: 2
  views: DataTableSavedView[]
  activeViewId: string | null
  layout: DataTableWorkspaceLayout
}

type LegacyStoredState = {
  version?: number
  views?: Array<Partial<DataTableSavedView> & { id: string; name: string }>
  activeViewId?: string | null
  visibility?: Record<string, boolean>
  columnOrder?: string[]
  pinned?: string[]
  columnWidths?: Record<string, number>
}

export function workspaceStorageKey(tableId: string): string {
  return `mlair:data-table:${tableId}`
}

export function widthsStorageKey(tableId: string): string {
  return `mlair:data-table-widths:${tableId}`
}

export function resolveWidthStorageKey(
  tableId: string | undefined,
  columnIds: string[],
): string | null {
  if (tableId) return widthsStorageKey(tableId)
  if (columnIds.length === 0) return null
  return `mlair:data-table-widths:cols:${columnIds.join("--")}`
}

export function mergeColumnOrder(order: string[], columnIds: string[]): string[] {
  const known = new Set(columnIds)
  const kept = order.filter((id) => known.has(id))
  const missing = columnIds.filter((id) => !kept.includes(id))
  return [...kept, ...missing]
}

export function moveColumnOrder(order: string[], columnId: string, direction: -1 | 1): string[] {
  const index = order.indexOf(columnId)
  if (index < 0) return order
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item!)
  return next
}

export function normalizeSavedView(
  raw: Partial<DataTableSavedView> & { id: string; name: string },
  fallbackOrder: string[] = [],
): DataTableSavedView {
  return {
    id: raw.id,
    name: raw.name.trim() || "Untitled view",
    density: migrateStoredDensity(raw.density),
    pageSize: typeof raw.pageSize === "number" && raw.pageSize > 0 ? raw.pageSize : 25,
    visibility: raw.visibility ?? {},
    columnOrder: Array.isArray(raw.columnOrder)
      ? mergeColumnOrder(raw.columnOrder, fallbackOrder.length ? fallbackOrder : raw.columnOrder)
      : fallbackOrder,
    pinned: Array.isArray(raw.pinned) ? raw.pinned : [],
    sorts: Array.isArray(raw.sorts) ? raw.sorts : [],
    filters: raw.filters ?? {},
    columnWidths: raw.columnWidths ?? {},
  }
}

export function createDefaultWorkspace(
  layout: DataTableWorkspaceLayout,
): DataTableWorkspaceState {
  return {
    version: 2,
    views: [],
    activeViewId: null,
    layout,
  }
}

export function migrateWorkspaceState(
  raw: unknown,
  fallbackLayout: DataTableWorkspaceLayout,
): DataTableWorkspaceState {
  if (!raw || typeof raw !== "object") {
    return createDefaultWorkspace(fallbackLayout)
  }

  const legacy = raw as LegacyStoredState
  const views = (legacy.views ?? []).map((view) =>
    normalizeSavedView(view, fallbackLayout.columnOrder),
  )

  return {
    version: 2,
    views,
    activeViewId: legacy.activeViewId ?? null,
    layout: {
      visibility: legacy.visibility ?? fallbackLayout.visibility,
      columnOrder: mergeColumnOrder(
        legacy.columnOrder ?? fallbackLayout.columnOrder,
        fallbackLayout.columnOrder,
      ),
      pinned: legacy.pinned ?? fallbackLayout.pinned,
      columnWidths: legacy.columnWidths ?? fallbackLayout.columnWidths,
    },
  }
}

export function readWorkspaceState(
  tableId: string,
  fallbackLayout: DataTableWorkspaceLayout,
): DataTableWorkspaceState {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey(tableId))
    if (!raw) return createDefaultWorkspace(fallbackLayout)
    return migrateWorkspaceState(JSON.parse(raw), fallbackLayout)
  } catch {
    return createDefaultWorkspace(fallbackLayout)
  }
}

export function writeWorkspaceState(tableId: string, state: DataTableWorkspaceState): void {
  try {
    window.localStorage.setItem(workspaceStorageKey(tableId), JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

export function readStoredWidths(key: string): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return null
  }
}

export function writeStoredWidths(key: string | null, value: Record<string, number>): void {
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function uniqueViewName(base: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean))
  const trimmed = base.trim() || "Untitled view"
  if (!taken.has(trimmed.toLowerCase())) return trimmed
  let i = 2
  while (taken.has(`${trimmed} (${i})`.toLowerCase())) i += 1
  return `${trimmed} (${i})`
}

export function duplicateViewName(name: string, existingNames: string[]): string {
  return uniqueViewName(`${name.trim() || "Untitled view"} (copy)`, existingNames)
}
