import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Filter,
  LayoutTemplate,
  Pin,
  PinOff,
  Rows3,
  Search,
  TableProperties,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Density = "compact" | "default" | "comfortable"
type SortDirection = "asc" | "desc"

type DataTableSavedView = {
  id: string
  name: string
  density: Density
  pageSize: number
  visibility: Record<string, boolean>
  pinned: string[]
  sorts: Array<{ id: string; direction: SortDirection }>
  filters: Record<string, string[]>
  columnWidths?: Record<string, number>
}

type DataTableStoredState = {
  views: DataTableSavedView[]
  activeViewId: string | null
}

export interface DataTableColumnFilterOption {
  label: string
  value: string
}

export interface DataTableColumn<T> {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
  width?: number | string
  align?: "left" | "center" | "right"
  wrap?: boolean
  canHide?: boolean
  canPin?: boolean
  defaultHidden?: boolean
  getSortValue?: (row: T) => string | number | boolean | null | undefined
  getSearchValue?: (row: T) => string
  getFilterValue?: (row: T) => string | null | undefined
  filterOptions?: DataTableColumnFilterOption[]
  canResize?: boolean
  minWidth?: number
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  emptyMessage?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  tableId?: string
  loading?: boolean
  loadingRows?: number
  title?: string
  description?: string
  searchable?: boolean
  stickyHeader?: boolean
  stickyFirstColumn?: boolean
  defaultDensity?: Density
  defaultPageSize?: number
  pageSizeOptions?: number[]
  columnResize?: boolean
}

const DENSITY_ROW_CLASS: Record<Density, string> = {
  compact: "[&_td]:py-1.5 [&_th]:h-8 text-xs",
  default: "[&_td]:py-2 [&_th]:h-10 text-sm",
  comfortable: "[&_td]:py-3 [&_th]:h-11 text-sm",
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_COLUMN_WIDTH = 180
const MIN_COLUMN_WIDTH = 72

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
}

function storageKey(tableId: string) {
  return `mlair:data-table:${tableId}`
}

function widthsStorageKey(tableId: string) {
  return `mlair:data-table-widths:${tableId}`
}

function readStoredViews(tableId: string): DataTableStoredState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(tableId))
    if (!raw) return null
    return JSON.parse(raw) as DataTableStoredState
  } catch {
    return null
  }
}

function writeStoredViews(tableId: string, value: DataTableStoredState) {
  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

function readStoredWidths(tableId: string): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(widthsStorageKey(tableId))
    if (!raw) return null
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return null
  }
}

function writeStoredWidths(tableId: string, value: Record<string, number>) {
  try {
    window.localStorage.setItem(widthsStorageKey(tableId), JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

function headerLabel(header: React.ReactNode): string {
  return typeof header === "string" ? header : "Column"
}

function alignClass(align?: DataTableColumn<unknown>["align"]): string {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

function parseNumericWidth(width?: number | string): number | undefined {
  if (typeof width === "number") return width
  if (typeof width === "string") {
    const match = /^(\d+(?:\.\d+)?)px$/.exec(width.trim())
    if (match) return Number(match[1])
  }
  return undefined
}

function getEffectiveColumnWidth<T>(
  column: DataTableColumn<T>,
  resizedWidths: Record<string, number>,
): number {
  if (resizedWidths[column.id] != null) return resizedWidths[column.id]
  return parseNumericWidth(column.width) ?? DEFAULT_COLUMN_WIDTH
}

function columnWidthStyle<T>(
  column: DataTableColumn<T>,
  resizedWidths: Record<string, number>,
): { width: string; minWidth: string; maxWidth: string } {
  const px = getEffectiveColumnWidth(column, resizedWidths)
  return { width: `${px}px`, minWidth: `${px}px`, maxWidth: `${px}px` }
}

function getColumnSearchValue<T>(column: DataTableColumn<T>, row: T): string {
  if (column.getSearchValue) return column.getSearchValue(row)
  if (column.getSortValue) return String(column.getSortValue(row) ?? "")
  if (column.getFilterValue) return String(column.getFilterValue(row) ?? "")
  return ""
}

function getColumnSortValue<T>(column: DataTableColumn<T>, row: T): unknown {
  if (column.getSortValue) return column.getSortValue(row)
  if (column.getFilterValue) return column.getFilterValue(row)
  if (column.getSearchValue) return column.getSearchValue(row)
  return null
}

function renderLoadingTable(columnCount: number, rowCount: number, density: Density) {
  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain">
      <Table className={cn("table-fixed min-w-full", DENSITY_ROW_CLASS[density])}>
        <TableHeader>
          <TableRow className="border-border/70 hover:bg-transparent">
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={i}>
                <div className="h-3 w-20 rounded bg-muted" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <TableRow key={rowIndex} className="border-border/50">
              {Array.from({ length: columnCount }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <div className="h-3.5 w-full max-w-[10rem] rounded bg-muted/70" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  rowClassName,
  emptyMessage = "No rows",
  emptyTitle = "No data",
  emptyDescription = "Try changing filters, adjusting visible columns, or clearing search.",
  className,
  tableId,
  loading = false,
  loadingRows = 8,
  title,
  description,
  searchable = true,
  stickyHeader = true,
  stickyFirstColumn = true,
  defaultDensity = "default",
  defaultPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  columnResize = true,
}: DataTableProps<T>) {
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([])
  const resizedWidthsRef = useRef<Record<string, number>>({})

  const initialVisibility = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.id, column.defaultHidden ? false : true]),
      ) as Record<string, boolean>,
    [columns],
  )

  const [searchQuery, setSearchQuery] = useState("")
  const [density, setDensity] = useState<Density>(defaultDensity)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [pageIndex, setPageIndex] = useState(0)
  const [visibility, setVisibility] = useState<Record<string, boolean>>(initialVisibility)
  const [pinned, setPinned] = useState<string[]>([])
  const [sorts, setSorts] = useState<Array<{ id: string; direction: SortDirection }>>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [savedViews, setSavedViews] = useState<DataTableSavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [resizedWidths, setResizedWidths] = useState<Record<string, number>>({})
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1)

  useEffect(() => {
    resizedWidthsRef.current = resizedWidths
  }, [resizedWidths])

  useEffect(() => {
    setVisibility(initialVisibility)
  }, [initialVisibility])

  useEffect(() => {
    if (!tableId) return
    const stored = readStoredViews(tableId)
    const storedWidths = readStoredWidths(tableId)
    if (storedWidths) setResizedWidths(storedWidths)
    if (!stored) return
    setSavedViews(stored.views || [])
    setActiveViewId(stored.activeViewId)
    const active = stored.views.find((view) => view.id === stored.activeViewId)
    if (!active) return
    setDensity(active.density)
    setPageSize(active.pageSize)
    setVisibility((prev) => ({ ...prev, ...active.visibility }))
    setPinned(active.pinned)
    setSorts(active.sorts)
    setFilters(active.filters)
    if (active.columnWidths) setResizedWidths(active.columnWidths)
  }, [tableId])

  useEffect(() => {
    if (!tableId) return
    writeStoredViews(tableId, { views: savedViews, activeViewId })
  }, [activeViewId, savedViews, tableId])

  const visibleColumns = useMemo(() => {
    const filtered = columns.filter((column) => visibility[column.id] !== false)
    return filtered.length ? filtered : columns.slice(0, 1)
  }, [columns, visibility])

  const pinnedColumns = useMemo(() => {
    const allowed = pinned.filter((id) => visibleColumns.some((column) => column.id === id))
    if (!stickyFirstColumn || visibleColumns.length === 0) return allowed
    const firstId = visibleColumns[0]?.id
    return firstId && !allowed.includes(firstId) ? [firstId, ...allowed] : allowed
  }, [pinned, stickyFirstColumn, visibleColumns])

  const pinnedOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let left = 0
    pinnedColumns.forEach((id) => {
      offsets[id] = left
      const column = columns.find((entry) => entry.id === id)
      left += column ? getEffectiveColumnWidth(column, resizedWidths) : DEFAULT_COLUMN_WIDTH
    })
    return offsets
  }, [columns, pinnedColumns, resizedWidths])

  const filterableColumns = useMemo(
    () => visibleColumns.filter((column) => (column.filterOptions?.length ?? 0) > 0),
    [visibleColumns],
  )

  const processedRows = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    const searched = data.filter((row) => {
      if (!normalizedQuery) return true
      return visibleColumns.some((column) => {
        const value = getColumnSearchValue(column, row)
        return normalizeSearchText(value).includes(normalizedQuery)
      })
    })

    const filtered = searched.filter((row) =>
      filterableColumns.every((column) => {
        const selected = filters[column.id] ?? []
        if (!selected.length) return true
        const value = String(column.getFilterValue?.(row) ?? "")
        return selected.includes(value)
      }),
    )

    const sorted = [...filtered]
    if (sorts.length) {
      sorted.sort((a, b) => {
        for (const sort of sorts) {
          const column = columns.find((entry) => entry.id === sort.id)
          if (!column) continue
          const direction = sort.direction === "asc" ? 1 : -1
          const result = compareValues(getColumnSortValue(column, a), getColumnSortValue(column, b))
          if (result !== 0) return result * direction
        }
        return 0
      })
    }

    return sorted
  }, [columns, data, filterableColumns, filters, searchQuery, sorts, visibleColumns])

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize))

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1))
  }, [totalPages])

  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize
    return processedRows.slice(start, start + pageSize)
  }, [pageIndex, pageSize, processedRows])

  const activeFilterCount = Object.values(filters).reduce((sum, values) => sum + values.length, 0)
  const hasCustomWidths = Object.keys(resizedWidths).length > 0
  const canResetView =
    searchQuery.length > 0 ||
    activeFilterCount > 0 ||
    sorts.length > 0 ||
    pinned.length > 0 ||
    hasCustomWidths ||
    Object.keys(visibility).some((id) => visibility[id] === false) ||
    density !== defaultDensity ||
    pageSize !== defaultPageSize

  const setColumnVisible = (id: string, next: boolean) => {
    setVisibility((current) => ({ ...current, [id]: next }))
    setPageIndex(0)
  }

  const togglePinned = (id: string) => {
    setPinned((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }

  const toggleSort = (id: string, multi: boolean) => {
    const column = columns.find((entry) => entry.id === id)
    if (!column) return
    setSorts((current) => {
      const existing = current.find((entry) => entry.id === id)
      const rest = multi ? current.filter((entry) => entry.id !== id) : []
      if (!existing) return [...rest, { id, direction: "asc" }]
      if (existing.direction === "asc") return [...rest, { id, direction: "desc" }]
      return rest
    })
  }

  const updateFilter = (columnId: string, value: string, checked: boolean) => {
    setFilters((current) => {
      const next = new Set(current[columnId] ?? [])
      if (checked) next.add(value)
      else next.delete(value)
      return { ...current, [columnId]: [...next] }
    })
    setPageIndex(0)
  }

  const resetState = () => {
    setSearchQuery("")
    setDensity(defaultDensity)
    setPageSize(defaultPageSize)
    setPageIndex(0)
    setVisibility(initialVisibility)
    setPinned([])
    setSorts([])
    setFilters({})
    setResizedWidths({})
    setActiveViewId(null)
    if (tableId) writeStoredWidths(tableId, {})
  }

  const resetColumnWidth = useCallback((columnId: string) => {
    setResizedWidths((current) => {
      const next = { ...current }
      delete next[columnId]
      if (tableId) writeStoredWidths(tableId, next)
      return next
    })
  }, [tableId])

  const beginColumnResize = useCallback(
    (columnId: string, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const column = columns.find((entry) => entry.id === columnId)
      if (!column || column.canResize === false) return

      const minWidth = column.minWidth ?? MIN_COLUMN_WIDTH
      const startX = event.clientX
      const startWidth = getEffectiveColumnWidth(column, resizedWidthsRef.current)

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX
        const nextWidth = Math.max(minWidth, Math.round(startWidth + delta))
        setResizedWidths((current) => ({ ...current, [columnId]: nextWidth }))
      }

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        if (tableId) writeStoredWidths(tableId, resizedWidthsRef.current)
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [columns, tableId],
  )

  const saveCurrentView = () => {
    if (!tableId || typeof window === "undefined") return
    const name = window.prompt("Saved view name")
    if (!name?.trim()) return
    const view: DataTableSavedView = {
      id: crypto.randomUUID(),
      name: name.trim(),
      density,
      pageSize,
      visibility,
      pinned,
      sorts,
      filters,
      columnWidths: resizedWidths,
    }
    setSavedViews((current) => [...current.filter((entry) => entry.name !== view.name), view])
    setActiveViewId(view.id)
  }

  const applyView = (view: DataTableSavedView | null) => {
    if (!view) {
      resetState()
      return
    }
    setDensity(view.density)
    setPageSize(view.pageSize)
    setVisibility((prev) => ({ ...prev, ...view.visibility }))
    setPinned(view.pinned)
    setSorts(view.sorts)
    setFilters(view.filters)
    setResizedWidths(view.columnWidths ?? {})
    setPageIndex(0)
    setActiveViewId(view.id)
    if (tableId) writeStoredWidths(tableId, view.columnWidths ?? {})
  }

  const deleteActiveView = () => {
    if (!activeViewId) return
    setSavedViews((current) => current.filter((view) => view.id !== activeViewId))
    setActiveViewId(null)
  }

  const handleRowKeyDown = (row: T, rowIndex: number, e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      const nextIndex = Math.min(pagedRows.length - 1, rowIndex + 1)
      rowRefs.current[nextIndex]?.focus()
      setFocusedRowIndex(nextIndex)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const nextIndex = Math.max(0, rowIndex - 1)
      rowRefs.current[nextIndex]?.focus()
      setFocusedRowIndex(nextIndex)
      return
    }
    if (e.key === "Home") {
      e.preventDefault()
      rowRefs.current[0]?.focus()
      setFocusedRowIndex(0)
      return
    }
    if (e.key === "End") {
      e.preventDefault()
      const lastIndex = Math.max(0, pagedRows.length - 1)
      rowRefs.current[lastIndex]?.focus()
      setFocusedRowIndex(lastIndex)
      return
    }
    if ((e.key === "Enter" || e.key === " ") && onRowClick) {
      e.preventDefault()
      onRowClick(row)
    }
  }

  const currentViewLabel =
    savedViews.find((view) => view.id === activeViewId)?.name ?? (tableId ? "Default view" : "Local view")

  const tableMinWidth = useMemo(
    () =>
      visibleColumns.reduce(
        (sum, column) => sum + getEffectiveColumnWidth(column, resizedWidths),
        0,
      ),
    [resizedWidths, visibleColumns],
  )

  return (
    <div className={cn("panel-surface flex w-full min-w-0 flex-col overflow-hidden p-1", className)}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b border-border p-1">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                {title ? <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3> : null}
                {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tableId ? (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8">
                          <LayoutTemplate className="h-3.5 w-3.5" />
                          {currentViewLabel}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => applyView(null)}>Default view</DropdownMenuItem>
                        {savedViews.map((view) => (
                          <DropdownMenuItem key={view.id} onSelect={() => applyView(view)}>
                            {view.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={saveCurrentView}>Save current view…</DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={deleteActiveView}
                          disabled={!activeViewId}
                        >
                          Delete active view
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8">
                      <Rows3 className="h-3.5 w-3.5" />
                      Density
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuCheckboxItem
                      checked={density === "compact"}
                      onCheckedChange={() => setDensity("compact")}
                    >
                      Compact
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={density === "default"}
                      onCheckedChange={() => setDensity("default")}
                    >
                      Default
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={density === "comfortable"}
                      onCheckedChange={() => setDensity("comfortable")}
                    >
                      Comfortable
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8">
                      <Columns3 className="h-3.5 w-3.5" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>Visibility</DropdownMenuLabel>
                    {columns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={visibility[column.id] !== false}
                        disabled={column.canHide === false}
                        onCheckedChange={(checked) => setColumnVisible(column.id, Boolean(checked))}
                      >
                        {headerLabel(column.header)}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Pin columns</DropdownMenuLabel>
                    {visibleColumns.map((column) => (
                      <DropdownMenuItem
                        key={`${column.id}-pin`}
                        disabled={column.canPin === false}
                        onSelect={() => togglePinned(column.id)}
                      >
                        {pinnedColumns.includes(column.id) ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                        {headerLabel(column.header)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {searchable ? (
                <label className="relative min-w-[16rem] flex-1 md:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPageIndex(0)
                    }}
                    placeholder="Search rows…"
                    className="h-8 pl-8 text-xs"
                    aria-label="Search table rows"
                  />
                </label>
              ) : null}

              {filterableColumns.map((column) => {
                const selected = filters[column.id] ?? []
                return (
                  <DropdownMenu key={column.id}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8">
                        <Filter className="h-3.5 w-3.5" />
                        {headerLabel(column.header)}
                        {selected.length ? ` (${selected.length})` : ""}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>{headerLabel(column.header)}</DropdownMenuLabel>
                      {column.filterOptions?.map((option) => {
                        const checked = selected.includes(option.value)
                        return (
                          <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={checked}
                            onCheckedChange={(next) =>
                              updateFilter(column.id, option.value, Boolean(next))
                            }
                          >
                            {option.label}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })}

              {canResetView ? (
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetState}>
                  <X className="h-3.5 w-3.5" />
                  Reset
                </Button>
              ) : null}
            </div>

            {activeFilterCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {filterableColumns.flatMap((column) =>
                  (filters[column.id] ?? []).map((value) => {
                    const option = column.filterOptions?.find((entry) => entry.value === value)
                    return (
                      <button
                        key={`${column.id}-${value}`}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-default hover:bg-accent"
                        onClick={() => updateFilter(column.id, value, false)}
                      >
                        <span className="font-medium text-foreground">{headerLabel(column.header)}:</span>
                        <span>{option?.label ?? value}</span>
                        <X className="h-3 w-3" />
                      </button>
                    )
                  }),
                )}
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderLoadingTable(Math.max(visibleColumns.length, 3), loadingRows, density)}
          </div>
        ) : processedRows.length === 0 ? (
          <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted">
              {searchQuery || activeFilterCount ? (
                <Search className="h-5 w-5 text-muted-foreground" />
              ) : (
                <TableProperties className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {searchQuery || activeFilterCount ? "No matching rows" : emptyTitle}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {searchQuery || activeFilterCount ? emptyDescription : emptyMessage}
              </p>
            </div>
            {searchQuery || activeFilterCount ? (
              <Button type="button" variant="outline" size="sm" onClick={resetState}>
                Clear search and filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <Table
                className={cn("table-fixed w-full", DENSITY_ROW_CLASS[density])}
                style={{ minWidth: `${tableMinWidth}px` }}
              >
                <TableHeader className={cn(stickyHeader && "sticky top-0 z-20 bg-card")}>
                  <TableRow className="border-border/70 hover:bg-transparent">
                    {visibleColumns.map((column) => {
                      const sortEntry = sorts.find((entry) => entry.id === column.id)
                      const sortIndex = sorts.findIndex((entry) => entry.id === column.id)
                      const isPinned = pinnedColumns.includes(column.id)
                      return (
                        <TableHead
                          key={column.id}
                          ref={(node) => {
                            headerRefs.current[column.id] = node
                          }}
                          style={{
                            ...columnWidthStyle(column, resizedWidths),
                            left: isPinned ? pinnedOffsets[column.id] : undefined,
                          }}
                          className={cn(
                            "relative border-border/70 bg-card text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                            alignClass(column.align),
                            stickyHeader && "top-0",
                            isPinned &&
                              "sticky z-30 border-r border-border bg-card",
                            column.headerClassName,
                            column.className,
                          )}
                        >
                          <div className="relative flex min-w-0 items-center pr-2">
                            <button
                              type="button"
                              className="inline-flex min-w-0 flex-1 items-center gap-1 text-left"
                              onClick={(e) => toggleSort(column.id, e.shiftKey)}
                            >
                              <span className="min-w-0 truncate">{column.header}</span>
                              {sortEntry ? (
                                sortEntry.direction === "asc" ? (
                                  <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              )}
                              {sortIndex >= 0 && sorts.length > 1 ? (
                                <span className="font-mono text-[10px]">{sortIndex + 1}</span>
                              ) : null}
                            </button>
                            {columnResize && column.canResize !== false ? (
                              <div
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${headerLabel(column.header)} column`}
                                title="Drag to resize · double-click to reset"
                                className="absolute -right-1 top-0 z-40 h-full w-2 cursor-col-resize touch-none hover:bg-primary/25 active:bg-primary/40"
                                onMouseDown={(event) => beginColumnResize(column.id, event)}
                                onDoubleClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  resetColumnWidth(column.id)
                                }}
                              />
                            ) : null}
                          </div>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((row, rowIndex) => (
                    <TableRow
                      key={keyExtractor(row)}
                      ref={(node) => {
                        rowRefs.current[rowIndex] = node
                      }}
                      data-selected={focusedRowIndex === rowIndex ? "true" : "false"}
                      tabIndex={0}
                      className={cn(
                        "group border-border/50 outline-none transition-default hover:bg-muted/30 focus-visible:bg-muted/30",
                        onRowClick && "cursor-pointer",
                        rowClassName?.(row),
                      )}
                      onClick={() => onRowClick?.(row)}
                      onFocus={() => setFocusedRowIndex(rowIndex)}
                      onKeyDown={(e) => handleRowKeyDown(row, rowIndex, e)}
                    >
                      {visibleColumns.map((column) => {
                        const isPinned = pinnedColumns.includes(column.id)
                        return (
                          <TableCell
                            key={column.id}
                            style={{
                              ...columnWidthStyle(column, resizedWidths),
                              left: isPinned ? pinnedOffsets[column.id] : undefined,
                            }}
                            className={cn(
                              alignClass(column.align),
                              "min-w-0",
                              !column.wrap && "whitespace-nowrap",
                              column.wrap && "whitespace-normal",
                              isPinned &&
                                "sticky z-10 border-r border-border bg-card group-hover:bg-muted/30 group-focus-visible:bg-muted/30",
                              column.className,
                            )}
                          >
                            {column.cell(row)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-1">
              <div className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {processedRows.length === 0 ? 0 : pageIndex * pageSize + 1}
                </span>
                –
                <span className="font-medium text-foreground">
                  {Math.min(processedRows.length, (pageIndex + 1) * pageSize)}
                </span>{" "}
                of <span className="font-medium text-foreground">{processedRows.length}</span>
                {processedRows.length !== data.length ? (
                  <span> filtered from {data.length}</span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value))
                      setPageIndex(0)
                    }}
                  >
                    <SelectTrigger size="sm" className="h-8 w-[86px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageSizeOptions.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex(0)}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <div className="min-w-[5rem] text-center text-xs text-muted-foreground">
                    Page <span className="font-medium text-foreground">{pageIndex + 1}</span> / {totalPages}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageIndex >= totalPages - 1}
                    onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageIndex >= totalPages - 1}
                    onClick={() => setPageIndex(totalPages - 1)}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
