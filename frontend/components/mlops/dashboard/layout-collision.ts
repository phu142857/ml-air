import { DASHBOARD_COLS, type DashboardLayoutItem, type DashboardWidgetId } from "./types"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeLayoutItem(item: DashboardLayoutItem): DashboardLayoutItem {
  const w = clamp(item.w, 2, DASHBOARD_COLS)
  const x = clamp(item.x, 0, DASHBOARD_COLS - w)
  const h = clamp(item.h, 2, 8)
  const y = Math.max(0, item.y)
  return { ...item, x, y, w, h }
}

export function layoutItemsOverlap(a: DashboardLayoutItem, b: DashboardLayoutItem): boolean {
  if (a.id === b.id) return false
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function canPlaceAt(
  item: DashboardLayoutItem,
  x: number,
  y: number,
  placed: DashboardLayoutItem[],
): boolean {
  const candidate = normalizeLayoutItem({ ...item, x, y })
  if (candidate.x + candidate.w > DASHBOARD_COLS) return false
  return !placed.some((other) => layoutItemsOverlap(candidate, other))
}

function findOpenPosition(
  item: DashboardLayoutItem,
  placed: DashboardLayoutItem[],
  startY = 0,
): DashboardLayoutItem {
  for (let y = startY; y < 64; y++) {
    for (let x = 0; x <= DASHBOARD_COLS - item.w; x++) {
      if (canPlaceAt(item, x, y, placed)) {
        return normalizeLayoutItem({ ...item, x, y })
      }
    }
  }
  return normalizeLayoutItem({ ...item, y: startY })
}

function pushAwayFrom(
  moving: DashboardLayoutItem,
  blocker: DashboardLayoutItem,
  placed: DashboardLayoutItem[],
): DashboardLayoutItem {
  const pushDown = normalizeLayoutItem({ ...moving, y: blocker.y + blocker.h })
  if (!placed.some((other) => layoutItemsOverlap(pushDown, other))) {
    return pushDown
  }

  const pushRight = normalizeLayoutItem({
    ...moving,
    x: blocker.x + blocker.w,
    y: moving.y,
  })
  if (
    pushRight.x + pushRight.w <= DASHBOARD_COLS &&
    !placed.some((other) => layoutItemsOverlap(pushRight, other))
  ) {
    return pushRight
  }

  return findOpenPosition(moving, placed, blocker.y + blocker.h)
}

/**
 * Keep `pinnedId` fixed and reflow other visible widgets out of overlapping cells.
 */
export function resolveLayoutCollisions(
  items: DashboardLayoutItem[],
  pinnedId: DashboardWidgetId,
): DashboardLayoutItem[] {
  const normalized = items.map(normalizeLayoutItem)
  const hidden = normalized.filter((item) => !item.visible)
  const pinned = normalized.find((item) => item.id === pinnedId && item.visible)
  if (!pinned) return normalized

  const others = normalized
    .filter((item) => item.visible && item.id !== pinnedId)
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const placed: DashboardLayoutItem[] = [pinned]

  for (const item of others) {
    let next = { ...item }
    let guard = 0
    while (guard < 32) {
      const blocker = placed.find((other) => layoutItemsOverlap(next, other))
      if (!blocker) break
      next = pushAwayFrom(next, blocker, placed)
      guard++
    }
    placed.push(normalizeLayoutItem(next))
  }

  return [...placed, ...hidden]
}

/** Compact all visible widgets top-to-bottom (used on layout reset / load). */
export function compactLayout(items: DashboardLayoutItem[]): DashboardLayoutItem[] {
  const hidden = items.filter((item) => !item.visible).map(normalizeLayoutItem)
  const visible = items
    .filter((item) => item.visible)
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const placed: DashboardLayoutItem[] = []
  for (const item of visible) {
    placed.push(findOpenPosition(item, placed, item.y))
  }

  return [...placed, ...hidden]
}
