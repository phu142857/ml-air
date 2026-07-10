"use client"

import { useMemo, useState } from "react"
import { LayoutGrid, RotateCcw, Settings2 } from "lucide-react"

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

import {
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_META,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "./types"

type DashboardCustomizeMenuProps = {
  items: DashboardLayoutItem[]
  editMode: boolean
  onEditModeChange: (next: boolean) => void
  onVisibleChange: (id: DashboardWidgetId, visible: boolean) => void
  onReset: () => void
}

export function DashboardCustomizeMenu({
  items,
  editMode,
  onEditModeChange,
  onVisibleChange,
  onReset,
}: DashboardCustomizeMenuProps) {
  const visibleCount = items.filter((item) => item.visible).length

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
      <div className="min-w-0">
        <p className="font-heading text-sm font-semibold text-foreground">Operations board</p>
        <p className="text-xs text-muted-foreground">
          {editMode
            ? "Snap widgets to the 12-column grid · drag onto empty cells or resize by grid units"
            : `${visibleCount} widget${visibleCount === 1 ? "" : "s"} · executive overview`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={editMode ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => onEditModeChange(!editMode)}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {editMode ? "Done editing" : "Edit layout"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Widgets
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Show widgets</DropdownMenuLabel>
            {DASHBOARD_WIDGET_IDS.map((id) => {
              const item = items.find((entry) => entry.id === id)
              return (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={item?.visible ?? true}
                  onCheckedChange={(checked) => onVisibleChange(id, Boolean(checked))}
                >
                  {DASHBOARD_WIDGET_META[id].title}
                </DropdownMenuCheckboxItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset layout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function useDashboardDragState() {
  const [dragSourceId, setDragSourceId] = useState<DashboardWidgetId | null>(null)

  return useMemo(
    () => ({
      dragSourceId,
      onDragStart: setDragSourceId,
      onDragEnd: () => setDragSourceId(null),
    }),
    [dragSourceId],
  )
}
