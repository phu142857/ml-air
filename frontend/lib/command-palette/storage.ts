import type { RecentPaletteItem } from "./types"

const PINNED_KEY = "mlair:command-palette-pinned"
const RECENT_KEY = "mlair:command-palette-recent"
const MAX_RECENT = 12
const MAX_PINNED = 10

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

export function loadPinnedCommandIds(): string[] {
  const ids = readJson<string[]>(PINNED_KEY, [])
  return Array.isArray(ids) ? ids.slice(0, MAX_PINNED) : []
}

export function savePinnedCommandIds(ids: string[]): void {
  writeJson(PINNED_KEY, ids.slice(0, MAX_PINNED))
}

export function togglePinnedCommandId(id: string): string[] {
  const current = loadPinnedCommandIds()
  const next = current.includes(id) ? current.filter((x) => x !== id) : [id, ...current]
  const trimmed = next.slice(0, MAX_PINNED)
  savePinnedCommandIds(trimmed)
  return trimmed
}

export function loadRecentItems(): RecentPaletteItem[] {
  const items = readJson<RecentPaletteItem[]>(RECENT_KEY, [])
  if (!Array.isArray(items)) return []
  return items
    .filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
    .slice(0, MAX_RECENT)
}

export function pushRecentItem(item: Omit<RecentPaletteItem, "visitedAt">): RecentPaletteItem[] {
  const entry: RecentPaletteItem = { ...item, visitedAt: Date.now() }
  const current = loadRecentItems().filter((row) => row.id !== entry.id)
  const next = [entry, ...current].slice(0, MAX_RECENT)
  writeJson(RECENT_KEY, next)
  return next
}
