/** Parse ISO timestamp to epoch ms; returns null when invalid. */
export function parseTsMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Wall-clock span between two timestamps in milliseconds. */
export function wallDurationMs(
  startTs: string | null | undefined,
  endTs: string | null | undefined,
  nowMs?: number,
  liveEnd = false,
): number | null {
  const startMs = parseTsMs(startTs);
  if (startMs == null) return null;
  const endMs = liveEnd ? (nowMs ?? Date.now()) : parseTsMs(endTs);
  if (endMs == null) return null;
  return Math.max(0, endMs - startMs);
}
