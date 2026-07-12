/** DataTable findability helpers (Sprint 2.3) — client-side only. */

export type DataTableFilterOption = {
  label: string
  value: string
}

export const DATA_TABLE_SELECTION_COL_WIDTH = 40
export const DATA_TABLE_QUICK_FILTER_MAX_OPTIONS = 6
export const DATA_TABLE_DERIVED_FILTER_MAX_OPTIONS = 12

export function deriveFilterOptions<T>(
  column: {
    filterOptions?: DataTableFilterOption[]
    getFilterValue?: (row: T) => string | null | undefined
  },
  data: T[],
): DataTableFilterOption[] {
  if (column.filterOptions?.length) return column.filterOptions
  if (!column.getFilterValue) return []

  const values = new Set<string>()
  for (const row of data) {
    const raw = column.getFilterValue(row)
    if (raw == null) continue
    const value = String(raw).trim()
    if (!value) continue
    values.add(value)
    if (values.size > DATA_TABLE_DERIVED_FILTER_MAX_OPTIONS) return []
  }

  return [...values]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ label: value, value }))
}

export function isQuickFilterColumn(options: DataTableFilterOption[]): boolean {
  return options.length > 0 && options.length <= DATA_TABLE_QUICK_FILTER_MAX_OPTIONS
}

export function defaultRowCopyText<T>(
  row: T,
  columns: Array<{
    getSearchValue?: (row: T) => string
    getSortValue?: (row: T) => string | number | boolean | null | undefined
    getFilterValue?: (row: T) => string | null | undefined
  }>,
): string {
  return columns
    .map((column) => {
      if (column.getSearchValue) return column.getSearchValue(row)
      if (column.getSortValue != null) return String(column.getSortValue(row) ?? "")
      if (column.getFilterValue != null) return String(column.getFilterValue(row) ?? "")
      return ""
    })
    .join("\t")
}

export function formatRowsForClipboard(lines: string[]): string {
  return lines.filter((line) => line.length > 0).join("\n")
}

export function toggleSelectionSet(
  current: Set<string>,
  id: string,
  selected: boolean,
): Set<string> {
  const next = new Set(current)
  if (selected) next.add(id)
  else next.delete(id)
  return next
}
