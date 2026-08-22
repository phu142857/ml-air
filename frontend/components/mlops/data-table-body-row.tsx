"use client"

import type { ReactNode } from "react"
import { memo } from "react"
import { Copy, ExternalLink, CheckSquare, Square } from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableRow } from "@/components/ui/table"
import { DATA_TABLE_SELECTION_COL_WIDTH } from "@/lib/data-table-findability"
import { cn } from "@/lib/utils"

/** Narrow column shape used by memoized rows (avoids circular import with DataTable). */
export type DataTableBodyColumn<T> = {
  id: string
  cell: (row: T) => ReactNode
  className?: string
  wrap?: boolean
}

export type DataTableRowAction<T> = {
  id: string
  label: string
  onSelect: (row: T) => void
  disabled?: boolean | ((row: T) => boolean)
  destructive?: boolean
  separatorBefore?: boolean
}

type ColumnWidthStyle = { width: string; minWidth: string; maxWidth: string }

type DataTableBodyRowProps<T> = {
  row: T
  rowId: string
  rowIndex: number
  columns: Array<DataTableBodyColumn<T>>
  pinnedColumns: string[]
  pinnedOffsets: Record<string, number>
  columnWidthStyle: (column: DataTableBodyColumn<T>) => ColumnWidthStyle
  selectable: boolean
  isChecked: boolean
  isFocused: boolean
  isRovingTabStop: boolean
  stickyEdgeShadow: boolean
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  onFocusRow: (rowIndex: number) => void
  onKeyDownRow: (row: T, rowIndex: number, e: React.KeyboardEvent<HTMLTableRowElement>) => void
  onSelectRow: (rowId: string, selected: boolean) => void
  onCopyRow: (row: T) => void
  contextMenu: boolean
  rowActions?: DataTableRowAction<T>[]
  rowRef: (node: HTMLTableRowElement | null) => void
  variant?: "panel" | "flat"
}

function DataTableBodyRowInner<T>({
  row,
  rowId,
  rowIndex,
  columns,
  pinnedColumns,
  pinnedOffsets,
  columnWidthStyle,
  selectable,
  isChecked,
  isFocused,
  isRovingTabStop,
  stickyEdgeShadow,
  onRowClick,
  rowClassName,
  onFocusRow,
  onKeyDownRow,
  onSelectRow,
  onCopyRow,
  contextMenu,
  rowActions,
  rowRef,
  variant = "flat",
}: DataTableBodyRowProps<T>) {
  const isFlat = variant === "flat"
  const stickyCellBg = isFlat
    ? "bg-background group-hover:bg-accent/50 group-data-[selected=true]:bg-accent/40 group-focus-visible:bg-accent/40"
    : "bg-card group-hover:bg-muted/40 group-data-[selected=true]:bg-muted/50 group-focus-visible:bg-muted/50"
  const stickyShadowClass = stickyEdgeShadow
    ? "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-3 after:translate-x-full after:bg-gradient-to-r after:from-black/10 after:to-transparent dark:after:from-black/40"
    : ""

  const rowEl = (
    <TableRow
      ref={rowRef}
      data-selected={isFocused || isChecked ? "true" : "false"}
      data-row-id={rowId}
      tabIndex={isRovingTabStop ? 0 : -1}
      aria-selected={selectable ? isChecked : undefined}
      aria-rowindex={rowIndex + 2}
      className={cn(
        "group border-b outline-none transition-colors duration-150",
        isFlat
          ? "border-border/20 hover:bg-accent/50 active:bg-accent/60 data-[selected=true]:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          : "interactive-row border-border/50 hover:bg-muted/40 active:bg-muted/55 data-[selected=true]:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
        onRowClick && "cursor-pointer",
        isChecked && "bg-primary/5",
        rowClassName?.(row),
      )}
      onClick={() => onRowClick?.(row)}
      onFocus={() => onFocusRow(rowIndex)}
      onKeyDown={(e) => onKeyDownRow(row, rowIndex, e)}
    >
      {selectable ? (
        <TableCell
          className={cn(
            "sticky left-0 z-20 px-2",
            stickyCellBg,
            stickyShadowClass && !columns.some((c) => pinnedColumns.includes(c.id))
              ? stickyShadowClass
              : "",
          )}
          style={{ width: DATA_TABLE_SELECTION_COL_WIDTH, minWidth: DATA_TABLE_SELECTION_COL_WIDTH }}
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={isChecked}
            onCheckedChange={(checked) => onSelectRow(rowId, checked === true)}
            aria-label={`Select row ${rowId}`}
          />
        </TableCell>
      ) : null}
      {columns.map((column, colIndex) => {
        const isPinned = pinnedColumns.includes(column.id)
        const isLastPinned =
          isPinned && pinnedColumns[pinnedColumns.length - 1] === column.id
        return (
          <TableCell
            key={column.id}
            role="gridcell"
            aria-colindex={colIndex + (selectable ? 2 : 1)}
            style={{
              ...columnWidthStyle(column),
              left: isPinned ? pinnedOffsets[column.id] : undefined,
            }}
            className={cn(
              "max-w-0 overflow-hidden text-left",
              !column.wrap && "whitespace-nowrap",
              column.wrap && "whitespace-normal",
              isPinned && cn("sticky z-10 border-r", isFlat ? "border-border/40" : "border-border", stickyCellBg),
              isLastPinned && stickyShadowClass,
              column.className,
            )}
          >
            <div
              className={cn(
                "min-w-0 max-w-full text-left",
                !column.wrap && "truncate [&_a]:inline-block [&_a]:max-w-full [&_a]:truncate",
                column.wrap && "whitespace-normal break-words",
              )}
            >
              {column.cell(row)}
            </div>
          </TableCell>
        )
      })}
    </TableRow>
  )

  if (!contextMenu) return rowEl

  const customActions = rowActions ?? []

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowEl}</ContextMenuTrigger>
      <ContextMenuContent className="w-52" aria-label={`Actions for row ${rowId}`}>
        {onRowClick ? (
          <ContextMenuItem
            onSelect={() => onRowClick(row)}
            className="gap-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => onCopyRow(row)} className="gap-2">
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy row
        </ContextMenuItem>
        {selectable ? (
          <ContextMenuItem
            onSelect={() => onSelectRow(rowId, !isChecked)}
            className="gap-2"
          >
            {isChecked ? (
              <Square className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            )}
            {isChecked ? "Deselect" : "Select"}
          </ContextMenuItem>
        ) : null}
        {customActions.map((action) => {
          const disabled =
            typeof action.disabled === "function" ? action.disabled(row) : Boolean(action.disabled)
          return (
            <span key={action.id}>
              {action.separatorBefore ? <ContextMenuSeparator /> : null}
              <ContextMenuItem
                disabled={disabled}
                variant={action.destructive ? "destructive" : "default"}
                onSelect={() => action.onSelect(row)}
              >
                {action.label}
              </ContextMenuItem>
            </span>
          )
        })}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const DataTableBodyRow = memo(DataTableBodyRowInner) as typeof DataTableBodyRowInner
