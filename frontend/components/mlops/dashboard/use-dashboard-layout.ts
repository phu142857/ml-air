"use client"

import { useCallback, useEffect, useState } from "react"

import { DEFAULT_DASHBOARD_LAYOUT } from "./default-layout"
import { compactLayout, normalizeLayoutItem, resolveLayoutCollisions } from "./layout-collision"
import {
  DASHBOARD_WIDGET_IDS,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "./types"

const STORAGE_KEY = "mlair:dashboard-bento-layout"

function mergeWithDefaults(stored: DashboardLayoutItem[]): DashboardLayoutItem[] {
  const byId = new Map(stored.map((item) => [item.id, normalizeLayoutItem(item)]))
  return DASHBOARD_WIDGET_IDS.map((id) => {
    const existing = byId.get(id)
    const fallback = DEFAULT_DASHBOARD_LAYOUT.find((item) => item.id === id)!
    return existing ? { ...fallback, ...existing, id } : fallback
  })
}

function readLayout(): DashboardLayoutItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DASHBOARD_LAYOUT
    const parsed = JSON.parse(raw) as DashboardLayoutItem[]
    if (!Array.isArray(parsed)) return DEFAULT_DASHBOARD_LAYOUT
    return compactLayout(mergeWithDefaults(parsed))
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT
  }
}

function writeLayout(items: DashboardLayoutItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore storage failures
  }
}

function applyLayoutChange(
  items: DashboardLayoutItem[],
  changedId: DashboardWidgetId,
): DashboardLayoutItem[] {
  return resolveLayoutCollisions(items, changedId)
}

export function useDashboardLayout() {
  const [items, setItems] = useState<DashboardLayoutItem[]>(DEFAULT_DASHBOARD_LAYOUT)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    setItems(readLayout())
  }, [])

  const persist = useCallback((next: DashboardLayoutItem[]) => {
    const normalized = next.map(normalizeLayoutItem)
    setItems(normalized)
    writeLayout(normalized)
  }, [])

  const setVisible = useCallback(
    (id: DashboardWidgetId, visible: boolean) => {
      persist(items.map((item) => (item.id === id ? { ...item, visible } : item)))
    },
    [items, persist],
  )

  const resetLayout = useCallback(() => {
    persist(DEFAULT_DASHBOARD_LAYOUT)
  }, [persist])

  const updateItem = useCallback(
    (id: DashboardWidgetId, patch: Partial<DashboardLayoutItem>) => {
      const next = items.map((item) =>
        item.id === id ? normalizeLayoutItem({ ...item, ...patch }) : item,
      )
      persist(applyLayoutChange(next, id))
    },
    [items, persist],
  )

  const swapPositions = useCallback(
    (sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => {
      const source = items.find((item) => item.id === sourceId)
      const target = items.find((item) => item.id === targetId)
      if (!source || !target || sourceId === targetId) return
      const swapped = items.map((item) => {
        if (item.id === sourceId) return { ...item, x: target.x, y: target.y }
        if (item.id === targetId) return { ...item, x: source.x, y: source.y }
        return item
      })
      persist(applyLayoutChange(swapped, sourceId))
    },
    [items, persist],
  )

  const moveItem = useCallback(
    (id: DashboardWidgetId, x: number, y: number) => {
      const next = items.map((item) =>
        item.id === id ? normalizeLayoutItem({ ...item, x, y }) : item,
      )
      persist(applyLayoutChange(next, id))
    },
    [items, persist],
  )

  return {
    items,
    editMode,
    setEditMode,
    setVisible,
    resetLayout,
    updateItem,
    swapPositions,
    moveItem,
  }
}
