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

type UsageSampleLike = {
  cpu_percent?: number | null
  memory_mb?: number | null
  gpu_util_percent?: number | null
  gpu_memory_mb?: number | null
  gpu_power_w?: number | null
  gpu_temp_c?: number | null
}

function sampleNums(samples: UsageSampleLike[], pick: (s: UsageSampleLike) => number | null | undefined): number[] {
  return samples
    .map(pick)
    .filter((v): v is number => v != null && !Number.isNaN(v))
}

function sampleAvg(vals: number[]): number | null {
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function sampleMax(vals: number[]): number | null {
  return vals.length ? Math.max(...vals) : null
}

function sampleP95(vals: number[]): number | null {
  if (!vals.length) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/** Peak/avg stats derived from heartbeat samples (matches run timeline chart). */
export function computeUsagePeaksFromSamples(samples: UsageSampleLike[]) {
  if (!samples.length) return undefined
  const cpu = sampleNums(samples, (s) => s.cpu_percent)
  const mem = sampleNums(samples, (s) => s.memory_mb)
  const gpu = sampleNums(samples, (s) => s.gpu_util_percent)
  const gpuMem = sampleNums(samples, (s) => s.gpu_memory_mb)
  const power = sampleNums(samples, (s) => s.gpu_power_w)
  const temp = sampleNums(samples, (s) => s.gpu_temp_c)
  return {
    cpu_pct_avg: sampleAvg(cpu),
    cpu_pct_peak: sampleMax(cpu),
    cpu_pct_p95: sampleP95(cpu),
    memory_mb_avg: sampleAvg(mem),
    memory_mb_peak: sampleMax(mem),
    gpu_util_pct_avg: sampleAvg(gpu),
    gpu_util_pct_peak: sampleMax(gpu),
    gpu_memory_mb_avg: sampleAvg(gpuMem),
    gpu_memory_mb_peak: sampleMax(gpuMem),
    gpu_power_w_peak: sampleMax(power),
    gpu_temp_c_peak: sampleMax(temp),
  }
}
