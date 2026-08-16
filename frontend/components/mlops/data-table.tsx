import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Filter,
  LayoutTemplate,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Rows3,
  Search,
  TableProperties,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { MlopsEmptyState } from "@/components/mlops/layout"
import {
  DataTableBodyRow,
  type DataTableRowAction,
} from "@/components/mlops/data-table-body-row"
import {
  DATA_TABLE_DENSITY_OPTIONS,
  DENSITY_ROW_CLASS,
  migrateStoredDensity,
  normalizeDataTableDensity,
  readPersistedDensity,
  writePersistedDensity,
  type DataTableDensity,
} from "@/lib/data-table-density"
import {
  DATA_TABLE_SELECTION_COL_WIDTH,
  defaultRowCopyText,
  deriveFilterOptions,
  formatRowsForClipboard,
  toggleSelectionSet,
} from "@/lib/data-table-findability"
import {
  computeVirtualWindow,
  estimateRowHeight,
  shouldVirtualizeRows,
} from "@/lib/data-table-performance"
import {
  duplicateViewName,
  mergeColumnOrder,
  moveColumnOrder,
  normalizeSavedView,
  readStoredWidths,
  readWorkspaceState,
  resolveWidthStorageKey,
  uniqueViewName,
  writeStoredWidths,
  writeWorkspaceState,
  type DataTableSavedView,
  type DataTableSortDirection,
  type DataTableWorkspaceLayout,
  type DataTableWorkspaceState,
} from "@/lib/data-table-workspace"
import { copyWithToast } from "@/lib/toast-actions"
import { cn } from "@/lib/utils"
import { useDebouncedTrue } from "@/hooks/use-debounced-true"

export type { DataTableDensity, DataTableRowAction }

type Density = DataTableDensity
type SortDirection = DataTableSortDirection

type ViewNameDialogMode = "save" | "rename" | null

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
  className?: string
  tableId?: string
  loading?: boolean
  loadingRows?: number
  /** Sprint 2.4 — shown instead of rows when set (role=alert). */
  error?: boolean
  errorTitle?: string
  errorMessage?: string
  onRetry?: () => void
  title?: string
  searchable?: boolean
  stickyHeader?: boolean
  stickyFirstColumn?: boolean
  /** compact | comfortable | spacious (legacy `default` maps to comfortable) */
  defaultDensity?: Density | "default"
  defaultPageSize?: number
  pageSizeOptions?: number[]
  columnResize?: boolean
  /** Enable row checkboxes + select-all / bulk copy (Sprint 2.3). Default true. */
  selectable?: boolean
  /** Optional custom copy text per row; defaults to tab-separated searchable fields. */
  getRowCopyText?: (row: T) => string
  /** Extra bulk actions rendered when one or more rows are selected. */
  bulkActions?: React.ReactNode | ((ctx: { selectedRows: T[]; selectedIds: string[] }) => React.ReactNode)
  /** Sprint 2.4 — right-click row menu. Default true. */
  contextMenu?: boolean
  /** Extra context-menu actions appended after built-ins. */
  rowActions?: DataTableRowAction<T>[]
  /**
   * Sprint 2.4 — virtualize large page bodies.
   * `auto` enables when page row count ≥ threshold.
   */
  virtualize?: boolean | "auto"
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

function headerLabel(header: React.ReactNode): string {
  return typeof header === "string" ? header : "Column"
}

function filterMenuMinWidthCh(
  options: Array<{ label: string; value: string }>,
  header: string,
): number {
  const longest = Math.max(header.length, ...options.map((option) => option.label.length), 0)
  return Math.min(56, Math.max(14, longest + 2))
}

function alignClass(): string {
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

function snapshotLayout(
  visibility: Record<string, boolean>,
  columnOrder: string[],
  pinned: string[],
  columnWidths: Record<string, number>,
): DataTableWorkspaceLayout {
  return { visibility, columnOrder, pinned, columnWidths }
}

function renderLoadingTable(columnCount: number, rowCount: number, density: Density) {
  return (
    <div
      className="min-h-0 flex-1 overflow-auto overscroll-contain motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading table rows"
    >
      <Table container={false} className={cn("table-fixed min-w-full", DENSITY_ROW_CLASS[density])}>
        <TableHeader className="sticky top-0 z-20 bg-card">
          <TableRow className="border-border/70 hover:bg-transparent">
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={i} className="bg-card">
                <div className="skeleton-pulse h-3 w-20 rounded bg-muted" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <TableRow key={rowIndex} className="border-border/50 hover:bg-transparent">
              {Array.from({ length: columnCount }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <div
                    className="skeleton-pulse h-3.5 w-full max-w-[10rem] rounded bg-muted/70"
                    style={{ width: `${55 + ((rowIndex + cellIndex) % 4) * 12}%` }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">Loading…</span>
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
  className,
  tableId,
  loading = false,
  loadingRows = 8,
  error = false,
  errorTitle = "Couldn’t load table",
  errorMessage = "Something went wrong while loading rows. Try again.",
  onRetry,
  title,
  searchable = true,
  stickyHeader = true,
  stickyFirstColumn = true,
  defaultDensity = "comfortable",
  defaultPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  columnResize = true,
  selectable = true,
  getRowCopyText,
  bulkActions,
  contextMenu = true,
  rowActions,
  virtualize = "auto",
}: DataTableProps<T>) {
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const resizedWidthsRef = useRef<Record<string, number>>({})
  const pendingKeyboardFocusRef = useRef<number | null>(null)
  const skipNextWorkspaceWriteRef = useRef(true)
  const resolvedDefaultDensity = normalizeDataTableDensity(defaultDensity)

  const initialVisibility = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.id, column.defaultHidden ? false : true]),
      ) as Record<string, boolean>,
    [columns],
  )

  const columnIds = useMemo(() => columns.map((column) => column.id), [columns])
  const widthStorageKey = useMemo(
    () => resolveWidthStorageKey(tableId, columnIds),
    [columnIds, tableId],
  )
  const defaultLayout = useMemo<DataTableWorkspaceLayout>(
    () => ({
      visibility: initialVisibility,
      columnOrder: columnIds,
      pinned: [],
      columnWidths: {},
    }),
    [columnIds, initialVisibility],
  )

  const [searchQuery, setSearchQuery] = useState("")
  const [density, setDensityState] = useState<Density>(() =>
    typeof window === "undefined"
      ? resolvedDefaultDensity
      : readPersistedDensity(resolvedDefaultDensity),
  )
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [pageIndex, setPageIndex] = useState(0)
  const [visibility, setVisibility] = useState<Record<string, boolean>>(initialVisibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(columnIds)
  const [pinned, setPinned] = useState<string[]>([])
  const [sorts, setSorts] = useState<Array<{ id: string; direction: SortDirection }>>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [savedViews, setSavedViews] = useState<DataTableSavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [resizedWidths, setResizedWidths] = useState<Record<string, number>>({})
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1)
  const [workspaceReady, setWorkspaceReady] = useState(!tableId)
  const [viewNameDialog, setViewNameDialog] = useState<ViewNameDialogMode>(null)
  const [viewNameDraft, setViewNameDraft] = useState("")
  const [deleteViewOpen, setDeleteViewOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(360)
  const [stickyEdgeShadow, setStickyEdgeShadow] = useState(false)

  const setDensity = useCallback((next: Density) => {
    setDensityState(next)
    writePersistedDensity(next)
  }, [])

  useEffect(() => {
    resizedWidthsRef.current = resizedWidths
  }, [resizedWidths])

  useEffect(() => {
    skipNextWorkspaceWriteRef.current = true
    setWorkspaceReady(false)

    let widths: Record<string, number> = {}
    if (widthStorageKey) {
      widths = readStoredWidths(widthStorageKey) ?? {}
    }

    if (tableId && typeof window !== "undefined") {
      const stored = readWorkspaceState(tableId, {
        ...defaultLayout,
        columnWidths: widths,
      })
      setSavedViews(stored.views)
      setActiveViewId(stored.activeViewId)

      const active = stored.views.find((view) => view.id === stored.activeViewId)
      const layout = active
        ? {
            visibility: { ...defaultLayout.visibility, ...active.visibility },
            columnOrder: mergeColumnOrder(active.columnOrder, columnIds),
            pinned: active.pinned,
            columnWidths:
              Object.keys(active.columnWidths).length > 0 ? active.columnWidths : widths,
          }
        : {
            visibility: { ...defaultLayout.visibility, ...stored.layout.visibility },
            columnOrder: mergeColumnOrder(stored.layout.columnOrder, columnIds),
            pinned: stored.layout.pinned,
            columnWidths:
              Object.keys(stored.layout.columnWidths).length > 0
                ? stored.layout.columnWidths
                : widths,
          }

      if (active) {
        setDensityState(migrateStoredDensity(active.density))
        setPageSize(active.pageSize)
        setSorts(active.sorts)
        setFilters(active.filters)
      }

      setVisibility(layout.visibility)
      setColumnOrder(layout.columnOrder)
      setPinned(layout.pinned)
      setResizedWidths(layout.columnWidths)
      resizedWidthsRef.current = layout.columnWidths
    } else {
      setVisibility(defaultLayout.visibility)
      setColumnOrder(defaultLayout.columnOrder)
      setPinned([])
      if (Object.keys(widths).length > 0) {
        setResizedWidths(widths)
        resizedWidthsRef.current = widths
      }
    }

    setWorkspaceReady(true)
  }, [columnIds, defaultLayout, tableId, widthStorageKey])

  useEffect(() => {
    if (!workspaceReady) return
    setVisibility((prev) => {
      const next = { ...initialVisibility }
      for (const [id, value] of Object.entries(prev)) {
        if (id in next) next[id] = value
      }
      return next
    })
    setColumnOrder((prev) => mergeColumnOrder(prev, columnIds))
    setPinned((prev) => prev.filter((id) => columnIds.includes(id)))
  }, [columnIds, initialVisibility, workspaceReady])

  useEffect(() => {
    if (!widthStorageKey || !workspaceReady) return
    writeStoredWidths(widthStorageKey, resizedWidths)
  }, [resizedWidths, widthStorageKey, workspaceReady])

  useEffect(() => {
    if (!tableId || !workspaceReady) return
    if (skipNextWorkspaceWriteRef.current) {
      skipNextWorkspaceWriteRef.current = false
      return
    }
    const layout = snapshotLayout(visibility, columnOrder, pinned, resizedWidths)

    let views = savedViews
    if (activeViewId != null) {
      const active = savedViews.find((view) => view.id === activeViewId)
      const needsSync =
        active != null &&
        (active.density !== density ||
          active.pageSize !== pageSize ||
          active.columnOrder.join("|") !== layout.columnOrder.join("|") ||
          active.pinned.join("|") !== layout.pinned.join("|") ||
          JSON.stringify(active.visibility) !== JSON.stringify(layout.visibility) ||
          JSON.stringify(active.columnWidths) !== JSON.stringify(layout.columnWidths) ||
          JSON.stringify(active.sorts) !== JSON.stringify(sorts) ||
          JSON.stringify(active.filters) !== JSON.stringify(filters))

      if (needsSync) {
        views = savedViews.map((view) =>
          view.id === activeViewId
            ? {
                ...view,
                density,
                pageSize,
                visibility: layout.visibility,
                columnOrder: layout.columnOrder,
                pinned: layout.pinned,
                columnWidths: layout.columnWidths,
                sorts,
                filters,
              }
            : view,
        )
        setSavedViews(views)
      }
    }

    writeWorkspaceState(tableId, {
      version: 2,
      views,
      activeViewId,
      layout,
    })
  }, [
    activeViewId,
    columnOrder,
    density,
    filters,
    pageSize,
    pinned,
    resizedWidths,
    savedViews,
    sorts,
    tableId,
    visibility,
    workspaceReady,
  ])

  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]))
    return mergeColumnOrder(columnOrder, columnIds)
      .map((id) => byId.get(id))
      .filter((column): column is DataTableColumn<T> => Boolean(column))
  }, [columnIds, columnOrder, columns])

  const visibleColumns = useMemo(() => {
    const filtered = orderedColumns.filter((column) => visibility[column.id] !== false)
    if (!filtered.length) return orderedColumns.slice(0, 1)

    const pinnedSet = new Set(pinned)
    const pinnedVisible = pinned
      .map((id) => filtered.find((column) => column.id === id))
      .filter((column): column is DataTableColumn<T> => Boolean(column))
    const unpinned = filtered.filter((column) => !pinnedSet.has(column.id))
    return [...pinnedVisible, ...unpinned]
  }, [orderedColumns, pinned, visibility])

  const pinnedColumns = useMemo(() => {
    const allowed = pinned.filter((id) => visibleColumns.some((column) => column.id === id))
    if (!stickyFirstColumn || visibleColumns.length === 0) return allowed
    const firstId = visibleColumns[0]?.id
    return firstId && !allowed.includes(firstId) ? [firstId, ...allowed] : allowed
  }, [pinned, stickyFirstColumn, visibleColumns])

  const pinnedOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let left = selectable ? DATA_TABLE_SELECTION_COL_WIDTH : 0
    pinnedColumns.forEach((id) => {
      offsets[id] = left
      const column = columns.find((entry) => entry.id === id)
      left += column ? getEffectiveColumnWidth(column, resizedWidths) : DEFAULT_COLUMN_WIDTH
    })
    return offsets
  }, [columns, pinnedColumns, resizedWidths, selectable])

  const filterSpecs = useMemo(
    () =>
      orderedColumns
        .map((column) => ({
          column,
          options: deriveFilterOptions(column, data),
        }))
        .filter((entry) => entry.options.length > 0),
    [data, orderedColumns],
  )

  const filterableColumns = useMemo(
    () => filterSpecs.map((entry) => entry.column),
    [filterSpecs],
  )

  const optionsByColumnId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveFilterOptions>>()
    for (const entry of filterSpecs) map.set(entry.column.id, entry.options)
    return map
  }, [filterSpecs])

  const processedRows = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    const searched = data.filter((row) => {
      if (!normalizedQuery) return true
      return orderedColumns.some((column) => {
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
  }, [columns, data, filterableColumns, filters, orderedColumns, searchQuery, sorts])

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize))

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1))
  }, [totalPages])

  useEffect(() => {
    const valid = new Set(processedRows.map((row) => keyExtractor(row)))
    setSelectedIds((current) => {
      let changed = false
      const next = new Set<string>()
      current.forEach((id) => {
        if (valid.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : current
    })
  }, [keyExtractor, processedRows])

  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize
    return processedRows.slice(start, start + pageSize)
  }, [pageIndex, pageSize, processedRows])

  const rowHeight = estimateRowHeight(density)
  const virtualEnabled = shouldVirtualizeRows(pagedRows.length, virtualize)
  const virtualWindow = useMemo(() => {
    if (!virtualEnabled) {
      return {
        startIndex: 0,
        endIndex: pagedRows.length,
        offsetTop: 0,
        offsetBottom: 0,
      }
    }
    return computeVirtualWindow({
      rowCount: pagedRows.length,
      rowHeight,
      scrollTop,
      viewportHeight,
      overscan: 8,
    })
  }, [pagedRows.length, rowHeight, scrollTop, viewportHeight, virtualEnabled])

  const visiblePagedRows = useMemo(
    () =>
      virtualEnabled
        ? pagedRows.slice(virtualWindow.startIndex, virtualWindow.endIndex)
        : pagedRows,
    [pagedRows, virtualEnabled, virtualWindow.endIndex, virtualWindow.startIndex],
  )

  const handleTableScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    setScrollTop(target.scrollTop)
    setStickyEdgeShadow(target.scrollLeft > 2)
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setViewportHeight(entry.contentRect.height)
    })
    observer.observe(node)
    setViewportHeight(node.clientHeight)
    setStickyEdgeShadow(node.scrollLeft > 2)
    return () => observer.disconnect()
  }, [loading, error, pagedRows.length])

  useEffect(() => {
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [pageIndex, pageSize, searchQuery, filters, sorts])

  const selectedRows = useMemo(
    () => processedRows.filter((row) => selectedIds.has(keyExtractor(row))),
    [keyExtractor, processedRows, selectedIds],
  )

  const pageIds = useMemo(() => pagedRows.map((row) => keyExtractor(row)), [keyExtractor, pagedRows])
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))
  const allFilteredSelected =
    processedRows.length > 0 && processedRows.every((row) => selectedIds.has(keyExtractor(row)))

  const activeFilterCount = Object.values(filters).reduce((sum, values) => sum + values.length, 0)
  const hasCustomWidths = Object.keys(resizedWidths).length > 0
  const orderChanged = columnOrder.join("|") !== columnIds.join("|")
  const canResetView =
    searchQuery.length > 0 ||
    activeFilterCount > 0 ||
    sorts.length > 0 ||
    pinned.length > 0 ||
    hasCustomWidths ||
    orderChanged ||
    Object.keys(visibility).some((id) => visibility[id] === false) ||
    density !== resolvedDefaultDensity ||
    pageSize !== defaultPageSize

  const setColumnVisible = (id: string, next: boolean) => {
    setVisibility((current) => ({ ...current, [id]: next }))
    setPageIndex(0)
  }

  const togglePinned = (id: string) => {
    setPinned((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  const moveColumn = (id: string, direction: -1 | 1) => {
    setColumnOrder((current) => moveColumnOrder(mergeColumnOrder(current, columnIds), id, direction))
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

  const clearSort = (id?: string) => {
    if (!id) {
      setSorts([])
      return
    }
    setSorts((current) => current.filter((entry) => entry.id !== id))
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

  const clearFilters = () => {
    setFilters({})
    setPageIndex(0)
  }

  const setRowSelected = (id: string, selected: boolean) => {
    setSelectedIds((current) => toggleSelectionSet(current, id, selected))
  }

  const toggleSelectPage = (selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of pageIds) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const selectAllFiltered = () => {
    setSelectedIds(new Set(processedRows.map((row) => keyExtractor(row))))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const resolveRowCopyText = useCallback(
    (row: T) => getRowCopyText?.(row) ?? defaultRowCopyText(row, orderedColumns),
    [getRowCopyText, orderedColumns],
  )

  const copySelectedRows = useCallback(async () => {
    if (!selectedRows.length) return
    const text = formatRowsForClipboard(selectedRows.map((row) => resolveRowCopyText(row)))
    await copyWithToast(text, {
      successTitle: `Copied ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"}`,
    })
  }, [resolveRowCopyText, selectedRows])

  const copySingleRow = useCallback(
    async (row: T) => {
      const text = resolveRowCopyText(row)
      await copyWithToast(text, { successTitle: "Row copied" })
    },
    [resolveRowCopyText],
  )

  const getColumnWidthStyle = useCallback(
    (column: { id: string; width?: number | string; minWidth?: number }) =>
      columnWidthStyle(column as DataTableColumn<T>, resizedWidths),
    [resizedWidths],
  )

  const softLoading = useDebouncedTrue(loading && data.length > 0 && !error, 800)
  const hardLoading = loading && data.length === 0 && !error

  const resetState = () => {
    setSearchQuery("")
    setDensity(resolvedDefaultDensity)
    setPageSize(defaultPageSize)
    setPageIndex(0)
    setVisibility(initialVisibility)
    setColumnOrder(columnIds)
    setPinned([])
    setSorts([])
    setFilters({})
    setResizedWidths({})
    setActiveViewId(null)
    setSelectedIds(new Set())
    if (widthStorageKey) writeStoredWidths(widthStorageKey, {})
  }

  const resetColumnWidth = useCallback((columnId: string) => {
    setResizedWidths((current) => {
      const next = { ...current }
      delete next[columnId]
      resizedWidthsRef.current = next
      return next
    })
  }, [])

  const beginColumnResize = useCallback(
    (columnId: string, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const column = columns.find((entry) => entry.id === columnId)
      if (!column || column.canResize === false) return

      const minWidth = column.minWidth ?? MIN_COLUMN_WIDTH
      const startX = event.clientX
      const startWidth = getEffectiveColumnWidth(column, resizedWidthsRef.current)
      let latestWidths = resizedWidthsRef.current

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX
        const nextWidth = Math.max(minWidth, Math.round(startWidth + delta))
        setResizedWidths((current) => {
          latestWidths = { ...current, [columnId]: nextWidth }
          resizedWidthsRef.current = latestWidths
          return latestWidths
        })
      }

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        if (widthStorageKey) writeStoredWidths(widthStorageKey, latestWidths)
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [columns, widthStorageKey],
  )

  const captureCurrentView = useCallback(
    (id: string, name: string): DataTableSavedView =>
      normalizeSavedView(
        {
          id,
          name,
          density,
          pageSize,
          visibility,
          columnOrder,
          pinned,
          sorts,
          filters,
          columnWidths: resizedWidths,
        },
        columnIds,
      ),
    [
      columnIds,
      columnOrder,
      density,
      filters,
      pageSize,
      pinned,
      resizedWidths,
      sorts,
      visibility,
    ],
  )

  const openSaveViewDialog = () => {
    if (!tableId) return
    setViewNameDraft("")
    setViewNameDialog("save")
  }

  const openRenameViewDialog = () => {
    const active = savedViews.find((view) => view.id === activeViewId)
    if (!active) return
    setViewNameDraft(active.name)
    setViewNameDialog("rename")
  }

  const commitViewNameDialog = () => {
    const name = viewNameDraft.trim()
    if (!name || !tableId) return

    if (viewNameDialog === "save") {
      const unique = uniqueViewName(
        name,
        savedViews.map((view) => view.name),
      )
      const view = captureCurrentView(crypto.randomUUID(), unique)
      setSavedViews((current) => [...current, view])
      setActiveViewId(view.id)
    }

    if (viewNameDialog === "rename" && activeViewId) {
      const unique = uniqueViewName(
        name,
        savedViews.filter((view) => view.id !== activeViewId).map((view) => view.name),
      )
      setSavedViews((current) =>
        current.map((view) => (view.id === activeViewId ? { ...view, name: unique } : view)),
      )
    }

    setViewNameDialog(null)
    setViewNameDraft("")
  }

  const applyView = (view: DataTableSavedView | null) => {
    if (!view) {
      resetState()
      return
    }
    const normalized = normalizeSavedView(view, columnIds)
    setDensity(migrateStoredDensity(normalized.density))
    setPageSize(normalized.pageSize)
    setVisibility((prev) => ({ ...prev, ...normalized.visibility }))
    setColumnOrder(mergeColumnOrder(normalized.columnOrder, columnIds))
    setPinned(normalized.pinned)
    setSorts(normalized.sorts)
    setFilters(normalized.filters)
    setResizedWidths(normalized.columnWidths)
    setPageIndex(0)
    setActiveViewId(normalized.id)
    if (widthStorageKey) writeStoredWidths(widthStorageKey, normalized.columnWidths)
  }

  const duplicateActiveView = () => {
    const active = savedViews.find((view) => view.id === activeViewId)
    if (!active) return
    const name = duplicateViewName(
      active.name,
      savedViews.map((view) => view.name),
    )
    const copy = captureCurrentView(crypto.randomUUID(), name)
    setSavedViews((current) => [...current, copy])
    setActiveViewId(copy.id)
  }

  const confirmDeleteActiveView = () => {
    if (!activeViewId) return
    setSavedViews((current) => current.filter((view) => view.id !== activeViewId))
    setActiveViewId(null)
    setDeleteViewOpen(false)
  }

  const focusPagedRow = useCallback(
    (nextIndex: number) => {
      setFocusedRowIndex(nextIndex)
      pendingKeyboardFocusRef.current = nextIndex
      if (virtualEnabled && scrollRef.current) {
        const top = nextIndex * rowHeight
        const bottom = top + rowHeight
        const node = scrollRef.current
        if (top < node.scrollTop) node.scrollTop = top
        else if (bottom > node.scrollTop + node.clientHeight) {
          node.scrollTop = bottom - node.clientHeight
        }
      }
    },
    [rowHeight, virtualEnabled],
  )

  const handleRowKeyDown = useCallback(
    (row: T, rowIndex: number, e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        focusPagedRow(Math.min(pagedRows.length - 1, rowIndex + 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        focusPagedRow(Math.max(0, rowIndex - 1))
        return
      }
      if (e.key === "Home") {
        e.preventDefault()
        focusPagedRow(0)
        return
      }
      if (e.key === "End") {
        e.preventDefault()
        focusPagedRow(Math.max(0, pagedRows.length - 1))
        return
      }
      if (e.key === "PageDown") {
        e.preventDefault()
        if (pageIndex < totalPages - 1) {
          pendingKeyboardFocusRef.current = 0
          setPageIndex((current) => Math.min(totalPages - 1, current + 1))
          setFocusedRowIndex(0)
        }
        return
      }
      if (e.key === "PageUp") {
        e.preventDefault()
        if (pageIndex > 0) {
          pendingKeyboardFocusRef.current = 0
          setPageIndex((current) => Math.max(0, current - 1))
          setFocusedRowIndex(0)
        }
        return
      }
      if ((e.key === "Enter" || e.key === " ") && onRowClick) {
        e.preventDefault()
        onRowClick(row)
      }
    },
    [focusPagedRow, onRowClick, pageIndex, pagedRows.length, totalPages],
  )

  useEffect(() => {
    const pending = pendingKeyboardFocusRef.current
    if (pending == null) return
    pendingKeyboardFocusRef.current = null
    const localIndex = virtualEnabled ? pending - virtualWindow.startIndex : pending
    const node = rowRefs.current[localIndex]
    node?.focus()
  }, [pageIndex, pagedRows, virtualEnabled, virtualWindow.startIndex, visiblePagedRows])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTyping =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable)
      const inTable = Boolean(target?.closest("[data-datatable-root='true']"))

      if (event.key === "/" && !isTyping) {
        if (!searchable || !inTable) return
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (event.key === "Escape") {
        if (isTyping && target === searchInputRef.current) {
          if (searchQuery) {
            event.preventDefault()
            setSearchQuery("")
            setPageIndex(0)
          }
          return
        }
        if (!inTable || isTyping) return
        if (selectedIds.size) {
          event.preventDefault()
          clearSelection()
          return
        }
        if (searchQuery || activeFilterCount || sorts.length) {
          event.preventDefault()
          setSearchQuery("")
          clearFilters()
          clearSort()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        if (!selectable || !inTable || isTyping) return
        event.preventDefault()
        selectAllFiltered()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        if (!selectable || !inTable || isTyping || !selectedRows.length) return
        // Allow native copy when user has a text selection
        const selection = window.getSelection()?.toString()
        if (selection?.trim()) return
        event.preventDefault()
        void copySelectedRows()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    activeFilterCount,
    copySelectedRows,
    searchable,
    selectable,
    selectedIds.size,
    selectedRows.length,
    searchQuery,
    sorts.length,
  ])

  const currentViewLabel =
    savedViews.find((view) => view.id === activeViewId)?.name ?? (tableId ? "Default view" : "Local view")

  const tableMinWidth = useMemo(
    () =>
      visibleColumns.reduce(
        (sum, column) => sum + getEffectiveColumnWidth(column, resizedWidths),
        selectable ? DATA_TABLE_SELECTION_COL_WIDTH : 0,
      ),
    [resizedWidths, selectable, visibleColumns],
  )

  const resolvedBulkActions =
    typeof bulkActions === "function"
      ? bulkActions({ selectedRows, selectedIds: [...selectedIds] })
      : bulkActions

  return (
    <div
      className={cn("panel-surface flex w-full min-w-0 flex-col overflow-hidden p-1", className)}
      data-datatable-root="true"
      aria-busy={loading || undefined}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b border-border bg-card/80 px-3 py-2.5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {searchable ? (
                <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPageIndex(0)
                    }}
                    placeholder="Search…  (/)"
                    className="h-8 pl-8 pr-16 text-xs"
                    aria-label="Search table rows"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
                    {searchQuery.trim()
                      ? `${processedRows.length}/${data.length}`
                      : `${data.length}`}
                  </span>
                </label>
              ) : null}

              {filterSpecs.map(({ column, options }) => {
                  const selected = filters[column.id] ?? []
                  const menuMinCh = filterMenuMinWidthCh(options, headerLabel(column.header))
                  const isMonoFilter = column.id === "pipeline" || column.id === "run_id"
                  return (
                    <DropdownMenu key={column.id}>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8 w-auto max-w-full shrink-0">
                          <Filter className="h-3.5 w-3.5 shrink-0" />
                          <span className="whitespace-nowrap">{headerLabel(column.header)}</span>
                          {selected.length ? ` (${selected.length})` : ""}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-max max-w-[min(100vw-2rem,40rem)]"
                        style={{ minWidth: `${menuMinCh}ch` }}
                      >
                        <DropdownMenuLabel>{headerLabel(column.header)}</DropdownMenuLabel>
                        {options.map((option) => {
                          const checked = selected.includes(option.value)
                          return (
                            <DropdownMenuCheckboxItem
                              key={option.value}
                              checked={checked}
                              className={isMonoFilter ? "font-mono text-xs" : undefined}
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

              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                {tableId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8 min-w-[8.5rem] justify-start">
                        <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[9rem] truncate">{currentViewLabel}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => applyView(null)}>
                        Default view
                      </DropdownMenuItem>
                      {savedViews.map((view) => (
                        <DropdownMenuItem
                          key={view.id}
                          onSelect={() => applyView(view)}
                          className={cn(view.id === activeViewId && "bg-accent")}
                        >
                          {view.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={openSaveViewDialog}>
                        Save current view…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={openRenameViewDialog} disabled={!activeViewId}>
                        <Pencil className="h-3.5 w-3.5" />
                        Rename view…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={duplicateActiveView} disabled={!activeViewId}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate view
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeleteViewOpen(true)}
                        disabled={!activeViewId}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete view…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 min-w-[7.5rem] justify-start"
                      aria-label={`Row density: ${DATA_TABLE_DENSITY_OPTIONS.find((o) => o.value === density)?.label ?? density}`}
                    >
                      <Rows3 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {DATA_TABLE_DENSITY_OPTIONS.find((o) => o.value === density)?.label ?? "Density"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Row density</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={density}
                      onValueChange={(value) => setDensity(normalizeDataTableDensity(value))}
                    >
                      {DATA_TABLE_DENSITY_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          <span className="flex flex-col gap-0.5">
                            <span>{option.label}</span>
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 min-w-[6.5rem] justify-start">
                      <Columns3 className="h-3.5 w-3.5 shrink-0" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 p-0">
                    <div className="border-b border-border px-3 py-2">
                      <DropdownMenuLabel className="p-0">Columns</DropdownMenuLabel>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Toggle visibility, reorder, and pin
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1">
                      {orderedColumns.map((column, index) => {
                        const isPinned = pinned.includes(column.id)
                        const isVisible = visibility[column.id] !== false
                        return (
                          <div
                            key={column.id}
                            className="interactive-row flex items-center gap-1 rounded-md px-1 py-1"
                          >
                            <DropdownMenuCheckboxItem
                              checked={isVisible}
                              disabled={column.canHide === false}
                              onCheckedChange={(checked) =>
                                setColumnVisible(column.id, Boolean(checked))
                              }
                              onSelect={(event) => event.preventDefault()}
                              className="min-w-0 flex-1 py-1.5 pl-8"
                            >
                              <span className="truncate">{headerLabel(column.header)}</span>
                            </DropdownMenuCheckboxItem>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7 shrink-0"
                              disabled={index === 0}
                              aria-label={`Move ${headerLabel(column.header)} up`}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                moveColumn(column.id, -1)
                              }}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7 shrink-0"
                              disabled={index >= orderedColumns.length - 1}
                              aria-label={`Move ${headerLabel(column.header)} down`}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                moveColumn(column.id, 1)
                              }}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant={isPinned ? "secondary" : "ghost"}
                              size="icon-sm"
                              className="h-7 w-7 shrink-0"
                              disabled={column.canPin === false || !isVisible}
                              aria-label={
                                isPinned
                                  ? `Unpin ${headerLabel(column.header)}`
                                  : `Pin ${headerLabel(column.header)}`
                              }
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                togglePinned(column.id)
                              }}
                            >
                              {isPinned ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {activeFilterCount > 0 || sorts.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {filterableColumns.flatMap((column) =>
                  (filters[column.id] ?? []).map((value) => {
                    const option = optionsByColumnId.get(column.id)?.find((entry) => entry.value === value)
                    return (
                      <button
                        key={`${column.id}-${value}`}
                        type="button"
                        className="interactive-row inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-default pressable"
                        onClick={() => updateFilter(column.id, value, false)}
                      >
                        <span className="shrink-0 font-medium text-foreground">{headerLabel(column.header)}:</span>
                        <span
                          className={cn(
                            "min-w-0 whitespace-nowrap text-foreground",
                            column.id === "pipeline" || column.id === "run_id" ? "font-mono" : undefined,
                          )}
                        >
                          {option?.label ?? value}
                        </span>
                        <X className="h-3 w-3 shrink-0" />
                      </button>
                    )
                  }),
                )}
                {sorts.map((sort, index) => {
                  const column = columns.find((entry) => entry.id === sort.id)
                  return (
                    <button
                      key={`sort-${sort.id}`}
                      type="button"
                      className="interactive-row inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-default pressable"
                      onClick={() => clearSort(sort.id)}
                      title="Remove sort"
                    >
                      <span className="font-medium text-foreground">
                        Sort {index + 1}: {column ? headerLabel(column.header) : sort.id}
                      </span>
                      <span>{sort.direction === "asc" ? "↑" : "↓"}</span>
                      <X className="h-3 w-3" />
                    </button>
                  )
                })}
                {activeFilterCount > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
                {sorts.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => clearSort()}
                  >
                    Clear sorts
                  </Button>
                ) : null}
              </div>
            ) : null}

            {selectable && selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
                <span className="text-xs font-medium text-foreground">
                  {selectedIds.size} selected
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => void copySelectedRows()}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy rows
                </Button>
                {!allFilteredSelected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={selectAllFiltered}
                  >
                    Select all {processedRows.length}
                  </Button>
                ) : null}
                {resolvedBulkActions}
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={clearSelection}>
                  Clear
                </Button>
                <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
                  Ctrl/⌘A select all · Ctrl/⌘C copy · Esc clear
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div
            className="flex min-h-[16rem] flex-1 items-center justify-center p-4"
            role="alert"
            aria-live="assertive"
          >
            <MlopsEmptyState
              icon={AlertCircle}
              title={errorTitle}
              action={
                onRetry ? (
                  <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Retry
                  </Button>
                ) : undefined
              }
              className="w-full max-w-md border-none bg-transparent py-8 ring-0"
            />
          </div>
        ) : hardLoading ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderLoadingTable(Math.max(visibleColumns.length + (selectable ? 1 : 0), 3), loadingRows, density)}
          </div>
        ) : processedRows.length === 0 ? (
          <div className="flex min-h-[16rem] flex-1 items-center justify-center p-4">
            <MlopsEmptyState
              icon={searchQuery || activeFilterCount ? Search : TableProperties}
              title={searchQuery || activeFilterCount ? "No matching rows" : emptyTitle || "No rows"}
              action={
                searchQuery || activeFilterCount ? (
                  <Button type="button" variant="outline" size="sm" onClick={resetState}>
                    Clear search and filters
                  </Button>
                ) : undefined
              }
              className="w-full max-w-md border-none bg-transparent py-8 ring-0"
            />
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {softLoading ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-border"
                role="status"
                aria-live="polite"
                aria-label="Refreshing table"
              >
                <div className="h-full w-1/3 animate-pulse bg-primary/70" />
              </div>
            ) : null}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
              onScroll={handleTableScroll}
            >
              <Table
                container={false}
                role="grid"
                aria-label={title || "Data table"}
                aria-rowcount={processedRows.length}
                aria-colcount={visibleColumns.length + (selectable ? 1 : 0)}
                className={cn("table-fixed border-collapse", DENSITY_ROW_CLASS[density])}
                style={{
                  width: `${tableMinWidth}px`,
                  minWidth: `${tableMinWidth}px`,
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  {selectable ? (
                    <col style={{ width: `${DATA_TABLE_SELECTION_COL_WIDTH}px` }} />
                  ) : null}
                  {visibleColumns.map((column) => (
                    <col
                      key={column.id}
                      style={{ width: `${getEffectiveColumnWidth(column, resizedWidths)}px` }}
                    />
                  ))}
                </colgroup>
                <TableHeader
                  className={cn(
                    stickyHeader && "sticky top-0 z-20 border-b border-border bg-card",
                  )}
                >
                  <TableRow className="border-border/70 hover:bg-transparent">
                    {selectable ? (
                      <TableHead
                        className={cn(
                          "sticky left-0 z-30 w-10 bg-card px-2",
                          stickyHeader && "top-0",
                          stickyEdgeShadow &&
                            "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-3 after:translate-x-full after:bg-gradient-to-r after:from-black/10 after:to-transparent dark:after:from-black/40",
                        )}
                      >
                        <Checkbox
                          checked={
                            allPageSelected ? true : somePageSelected ? "indeterminate" : false
                          }
                          onCheckedChange={(checked) => toggleSelectPage(checked === true)}
                          aria-label="Select all rows on this page"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </TableHead>
                    ) : null}
                    {visibleColumns.map((column) => {
                      const sortEntry = sorts.find((entry) => entry.id === column.id)
                      const sortIndex = sorts.findIndex((entry) => entry.id === column.id)
                      const isPinned = pinnedColumns.includes(column.id)
                      const isLastPinned =
                        isPinned && pinnedColumns[pinnedColumns.length - 1] === column.id
                      return (
                        <TableHead
                          key={column.id}
                          ref={(node) => {
                            headerRefs.current[column.id] = node
                          }}
                          scope="col"
                          aria-sort={
                            sortEntry
                              ? sortEntry.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                          style={{
                            ...columnWidthStyle(column, resizedWidths),
                            left: isPinned ? pinnedOffsets[column.id] : undefined,
                          }}
                          className={cn(
                            "relative overflow-hidden border-border/70 bg-card text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                            alignClass(),
                            stickyHeader && "top-0",
                            isPinned &&
                              "sticky z-30 border-r border-border bg-card",
                            isLastPinned &&
                              stickyEdgeShadow &&
                              "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-3 after:translate-x-full after:bg-gradient-to-r after:from-black/10 after:to-transparent dark:after:from-black/40",
                            column.headerClassName,
                            column.className,
                            "text-left",
                          )}
                        >
                          <div className="relative flex min-w-0 items-center pr-2">
                            <button
                              type="button"
                              className="interactive-row pressable inline-flex min-w-0 flex-1 items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                              title="Click to sort · Shift+click for multi-sort"
                              onClick={(e) => toggleSort(column.id, e.shiftKey)}
                            >
                              <span className="min-w-0 truncate">{column.header}</span>
                              {sortEntry ? (
                                sortEntry.direction === "asc" ? (
                                  <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                ) : (
                                  <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
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
                  {virtualEnabled && virtualWindow.offsetTop > 0 ? (
                    <TableRow aria-hidden className="hover:bg-transparent">
                      <TableCell
                        colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                        className="p-0"
                        style={{ height: virtualWindow.offsetTop }}
                      />
                    </TableRow>
                  ) : null}
                  {visiblePagedRows.map((row, localIndex) => {
                    const rowIndex = virtualEnabled
                      ? virtualWindow.startIndex + localIndex
                      : localIndex
                    const rowId = keyExtractor(row)
                    const isChecked = selectedIds.has(rowId)
                    const isFocused = focusedRowIndex === rowIndex
                    const isRovingTabStop =
                      isFocused || (focusedRowIndex < 0 && rowIndex === 0)
                    return (
                      <DataTableBodyRow
                        key={rowId}
                        row={row}
                        rowId={rowId}
                        rowIndex={rowIndex}
                        columns={visibleColumns}
                        pinnedColumns={pinnedColumns}
                        pinnedOffsets={pinnedOffsets}
                        columnWidthStyle={getColumnWidthStyle}
                        selectable={selectable}
                        isChecked={isChecked}
                        isFocused={isFocused}
                        isRovingTabStop={isRovingTabStop}
                        stickyEdgeShadow={stickyEdgeShadow}
                        onRowClick={onRowClick}
                        rowClassName={rowClassName}
                        onFocusRow={setFocusedRowIndex}
                        onKeyDownRow={handleRowKeyDown}
                        onSelectRow={setRowSelected}
                        onCopyRow={copySingleRow}
                        contextMenu={contextMenu}
                        rowActions={rowActions}
                        rowRef={(node) => {
                          rowRefs.current[localIndex] = node
                        }}
                      />
                    )
                  })}
                  {virtualEnabled && virtualWindow.offsetBottom > 0 ? (
                    <TableRow aria-hidden className="hover:bg-transparent">
                      <TableCell
                        colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                        className="p-0"
                        style={{ height: virtualWindow.offsetBottom }}
                      />
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div
              className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2"
              role="navigation"
              aria-label="Table pagination"
            >
              <div className="text-xs text-muted-foreground" aria-live="polite">
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

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={tableId ? `${tableId}-page-size` : undefined} className="text-xs text-muted-foreground">
                    Rows
                  </label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value))
                      setPageIndex(0)
                    }}
                  >
                    <SelectTrigger
                      id={tableId ? `${tableId}-page-size` : undefined}
                      size="sm"
                      className="h-8 w-[86px] text-xs"
                      aria-label="Rows per page"
                    >
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
                  <div className="min-w-[5.5rem] px-1 text-center text-xs text-muted-foreground">
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

      <Dialog
        open={viewNameDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setViewNameDialog(null)
            setViewNameDraft("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {viewNameDialog === "rename" ? "Rename view" : "Save view"}
            </DialogTitle>
            <DialogDescription>
              {viewNameDialog === "rename"
                ? "Update the name for the active saved view."
                : "Save the current column layout, pins, widths, density, and filters."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              commitViewNameDialog()
            }}
          >
            <Input
              value={viewNameDraft}
              onChange={(event) => setViewNameDraft(event.target.value)}
              placeholder="View name"
              aria-label="View name"
              autoFocus
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setViewNameDialog(null)
                  setViewNameDraft("")
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!viewNameDraft.trim()}>
                {viewNameDialog === "rename" ? "Rename" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteViewOpen}
        title="Delete saved view?"
        body={
          activeViewId
            ? `Delete “${savedViews.find((view) => view.id === activeViewId)?.name ?? "this view"}”? This only removes the saved layout from this browser.`
            : "Delete this saved view?"
        }
        confirmLabel="Delete view"
        onCancel={() => setDeleteViewOpen(false)}
        onDelete={confirmDeleteActiveView}
      />
    </div>
  )
}
