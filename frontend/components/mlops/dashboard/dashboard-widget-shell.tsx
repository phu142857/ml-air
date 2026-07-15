"use client"

import { GripVertical, Maximize2 } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  DASHBOARD_ROW_HEIGHT_PX,
  DASHBOARD_WIDGET_META,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "./types"

type DashboardWidgetShellProps = {
  item: DashboardLayoutItem
  editMode: boolean
  dragSourceId: DashboardWidgetId | null
  onDragStart: (id: DashboardWidgetId) => void
  onDragEnd: () => void
  onDropOn: (targetId: DashboardWidgetId) => void
  onResize: (id: DashboardWidgetId, w: number, h: number) => void
  children: React.ReactNode
  className?: string
}

export function DashboardWidgetShell({
  item,
  editMode,
  dragSourceId,
  onDragStart,
  onDragEnd,
  onDropOn,
  onResize,
  children,
  className,
}: DashboardWidgetShellProps) {
  const meta = DASHBOARD_WIDGET_META[item.id]

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startW = item.w
    const startH = item.h

    const colWidth =
      (event.currentTarget.closest("[data-dashboard-grid]")?.clientWidth ?? 1200) / 12

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const nextW = Math.max(2, Math.min(12 - item.x, Math.round(startW + deltaX / colWidth)))
      const nextH = Math.max(2, Math.min(8, Math.round(startH + deltaY / DASHBOARD_ROW_HEIGHT_PX)))
      onResize(item.id, nextW, nextH)
    }

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.body.style.cursor = "nwse-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  return (
    <section
      data-widget-id={item.id}
      draggable={editMode}
      onDragStart={(event) => {
        if (!editMode) return
        event.dataTransfer.effectAllowed = "move"
        onDragStart(item.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!editMode || !dragSourceId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
      }}
      onDrop={(event) => {
        if (!editMode || !dragSourceId) return
        event.preventDefault()
        onDropOn(item.id)
      }}
      className={cn(
        "panel-surface relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden transition-default",
        editMode && "ring-1 ring-primary/25",
        dragSourceId === item.id && "opacity-60",
        className,
      )}
      style={{
        gridColumn: `${item.x + 1} / span ${item.w}`,
        gridRow: `${item.y + 1} / span ${item.h}`,
      }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2",
          editMode && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {editMode ? (
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <div className="min-w-0">
            <h3 className="truncate font-heading text-xs font-semibold tracking-tight text-foreground">
              {meta.title}
            </h3>
          </div>
        </div>
        {editMode ? (
          <span
            className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            title="Grid size (columns × rows)"
          >
            {item.w}×{item.h}
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">{children}</div>

      {editMode ? (
        <div
          role="separator"
          aria-label={`Resize ${meta.title}`}
          title="Drag to resize"
          className="absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
          onMouseDown={handleResizeStart}
        >
          <Maximize2 className="h-3 w-3" />
        </div>
      ) : null}
    </section>
  )
}
