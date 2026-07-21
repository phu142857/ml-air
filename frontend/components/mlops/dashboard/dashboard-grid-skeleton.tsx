"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

import { buildDashboardGridStyle, isGridCellOccupied } from "./dashboard-grid-utils"
import { DASHBOARD_COLS, type DashboardLayoutItem, type DashboardWidgetId } from "./types"

type DashboardGridSkeletonProps = {
  rowCount: number
  items: DashboardLayoutItem[]
  dragSourceId: DashboardWidgetId | null
  onPlaceAt: (id: DashboardWidgetId, x: number, y: number) => void
  onDragEnd: () => void
}

export function DashboardGridSkeleton({
  rowCount,
  items,
  dragSourceId,
  onPlaceAt,
  onDragEnd,
}: DashboardGridSkeletonProps) {
  const [dropTarget, setDropTarget] = useState<{ x: number; y: number } | null>(null)

  const cells = Array.from({ length: rowCount * DASHBOARD_COLS }, (_, index) => ({
    x: index % DASHBOARD_COLS,
    y: Math.floor(index / DASHBOARD_COLS),
  }))

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 grid"
      style={buildDashboardGridStyle(rowCount)}
    >
      {cells.map(({ x, y }) => {
        const occupied = isGridCellOccupied(x, y, items, dragSourceId ?? undefined)
        const isDropTarget = dropTarget?.x === x && dropTarget?.y === y

        return (
          <div
            key={`${x}-${y}`}
            className={cn(
              "pointer-events-auto rounded-md border border-dashed transition-default",
              occupied
                ? "border-border/20 bg-transparent"
                : "border-border/45 bg-muted/20",
              !occupied && dragSourceId && "hover:border-primary/35 hover:bg-primary/5",
              isDropTarget && "border-primary/60 bg-primary/10 ring-1 ring-primary/25",
            )}
            style={{
              gridColumn: `${x + 1} / span 1`,
              gridRow: `${y + 1} / span 1`,
            }}
            onDragOver={(event) => {
              if (!dragSourceId || occupied) return
              event.preventDefault()
              event.dataTransfer.dropEffect = "move"
              setDropTarget({ x, y })
            }}
            onDragLeave={() => {
              if (dropTarget?.x === x && dropTarget?.y === y) setDropTarget(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!dragSourceId || occupied) return
              onPlaceAt(dragSourceId, x, y)
              setDropTarget(null)
              onDragEnd()
            }}
          />
        )
      })}
    </div>
  )
}
