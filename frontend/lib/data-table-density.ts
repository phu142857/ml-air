/** Shared DataTable density (Sprint 2.1). Persisted globally in localStorage. */

export const DATA_TABLE_DENSITY_STORAGE_KEY = "mlair.datatable.density"

export type DataTableDensity = "compact" | "comfortable" | "spacious"

export const DATA_TABLE_DENSITY_OPTIONS: Array<{
  value: DataTableDensity
  label: string
  description: string
}> = [
  { value: "compact", label: "Compact", description: "Dense rows for scanning" },
  { value: "comfortable", label: "Comfortable", description: "Balanced default" },
  { value: "spacious", label: "Spacious", description: "Roomier touch targets" },
]

export const DENSITY_ROW_CLASS: Record<DataTableDensity, string> = {
  compact: "[&_td]:py-1 [&_th]:h-8 text-xs",
  comfortable: "[&_td]:py-2 [&_th]:h-10 text-sm",
  spacious: "[&_td]:py-3.5 [&_th]:h-12 text-sm",
}

export function isDataTableDensity(value: unknown): value is DataTableDensity {
  return value === "compact" || value === "comfortable" || value === "spacious"
}

/**
 * Map stored / prop density onto the Sprint 2.1 scale.
 * Legacy alias: `default` → `comfortable`.
 */
export function migrateStoredDensity(value: unknown): DataTableDensity {
  if (isDataTableDensity(value)) return value
  if (value === "default") return "comfortable"
  return "comfortable"
}

export function normalizeDataTableDensity(
  value: unknown,
  fallback: DataTableDensity = "comfortable",
): DataTableDensity {
  if (isDataTableDensity(value)) return value
  if (value === "default") return "comfortable"
  return fallback
}

export function readPersistedDensity(
  fallback: DataTableDensity = "comfortable",
): DataTableDensity {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(DATA_TABLE_DENSITY_STORAGE_KEY)
    if (!raw) return fallback
    return migrateStoredDensity(raw)
  } catch {
    return fallback
  }
}

export function writePersistedDensity(density: DataTableDensity): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DATA_TABLE_DENSITY_STORAGE_KEY, density)
  } catch {
    // ignore quota / private mode
  }
}
