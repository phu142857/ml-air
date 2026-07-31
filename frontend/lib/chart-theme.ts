/** Theme-aware colors for Recharts / React Flow (read CSS variables at runtime). */

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function getChartGridStroke(): string {
  return readCssVar("--border", "oklch(0.9 0.012 265)")
}

export function getChartTooltipStyle(): { backgroundColor: string; border: string; color: string } {
  return {
    backgroundColor: readCssVar("--card", "oklch(1 0 0)"),
    border: `1px solid ${readCssVar("--border", "oklch(0.9 0.012 265)")}`,
    color: readCssVar("--foreground", "oklch(0.21 0.02 265)"),
  }
}

export function getFlowBackgroundColor(): string {
  return readCssVar("--muted", "oklch(0.955 0.01 265)")
}

function isDarkDocument(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

/** Light: ink stroke (readable). Dark: light gray so paths are not invisible on near-black. */
export function getFlowEdgeStrokeForMode(mode?: "light" | "dark"): string {
  const dark = mode ? mode === "dark" : isDarkDocument()
  if (dark) return "#E5E5E5"
  return readCssVar("--foreground", "#334155")
}

export function getFlowEdgeStroke(): string {
  return getFlowEdgeStrokeForMode()
}

export function getChartAxisStroke(): string {
  return readCssVar("--muted-foreground", "oklch(0.5 0.02 265)")
}
