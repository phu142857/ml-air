/** Per-scope last applied semantic event sequence (Phase 3 reconnect replay). */

const STORAGE_PREFIX = "mlair.execution.lastSequence.";

export function scopeSequenceKey(tenantId: string, projectId: string): string {
  return `${tenantId}::${projectId}`;
}

export function readLastSequence(tenantId: string, projectId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${scopeSequenceKey(tenantId, projectId)}`);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLastSequence(tenantId: string, projectId: string, sequence: number): void {
  if (typeof window === "undefined" || !Number.isFinite(sequence) || sequence <= 0) return;
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${scopeSequenceKey(tenantId, projectId)}`,
      String(Math.floor(sequence)),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function envelopeSequence(ev: { sequence?: unknown }): number | undefined {
  const seq = ev.sequence;
  return typeof seq === "number" && Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : undefined;
}
