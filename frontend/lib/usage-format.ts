export function formatRuntimeSeconds(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—"
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${r}s`
  return `${r}s`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"] as const
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

export function formatMemPeakKb(kb: number | null | undefined): string {
  if (kb == null || kb <= 0) return "—"
  const gb = kb / (1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function formatMemMb(mb: number | null | undefined): string {
  if (mb == null || mb <= 0) return "—"
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

export function formatPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—"
  return `${pct.toFixed(1)}%`
}

export function formatAvgPeak(
  avg: number | null | undefined,
  peak: number | null | undefined,
  fmt: (v: number) => string,
): string {
  const hasAvg = avg != null && !Number.isNaN(avg)
  const hasPeak = peak != null && !Number.isNaN(peak)
  if (!hasAvg && !hasPeak) return "—"
  if (hasAvg && hasPeak) return `${fmt(avg)} avg · ${fmt(peak)} peak`
  if (hasPeak) return `${fmt(peak)} peak`
  return `${fmt(avg!)} avg`
}

export function formatMemoryUsage(
  memoryMbAvg: number | null | undefined,
  memoryMbPeak: number | null | undefined,
  memoryRssPeakKb: number | null | undefined,
): string {
  const fromSamples = formatAvgPeak(memoryMbAvg, memoryMbPeak, formatMemMb)
  if (fromSamples !== "—") return fromSamples
  return formatMemPeakKb(memoryRssPeakKb)
}

export function taskUsageLabel(taskId: string, plugin?: string | null): string {
  if (plugin?.trim()) return plugin.trim()
  return taskId.length > 14 ? `${taskId.slice(0, 10)}…${taskId.slice(-4)}` : taskId
}
