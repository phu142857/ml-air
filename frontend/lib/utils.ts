import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTimeCompact(input?: string | null): string {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const dd = pad(d.getDate());
  const mo = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offH = Math.floor(abs / 60);
  const offM = abs % 60;
  const utc =
    offM === 0
      ? `UTC${sign}${offH}`
      : `UTC${sign}${String(offH).padStart(2, "0")}:${String(offM).padStart(2, "0")}`;
  return `${hh}:${mm}:${ss} ${dd}/${mo}/${yyyy} (${utc})`;
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatRowCount(count?: number | null): string {
  if (count == null || !Number.isFinite(count)) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

/** Turn thrown API client errors (often `Error(JSON.stringify(body))`) into a short user-facing string. */
export function formatApiClientError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const trimmed = raw.trim();
  if (!trimmed) return "Request failed";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      if (typeof o.detail === "string") return o.detail;
      if (Array.isArray(o.detail)) {
        const parts = o.detail
          .map((item) => {
            if (item && typeof item === "object" && item !== null && "msg" in item) {
              const msg = (item as { msg?: unknown }).msg;
              return typeof msg === "string" ? msg : JSON.stringify(item);
            }
            return typeof item === "string" ? item : JSON.stringify(item);
          })
          .filter(Boolean);
        if (parts.length) return parts.join("; ");
      }
      if (typeof o.message === "string") return o.message;
      if (typeof o.error === "string") return o.error;
    }
  } catch {
    /* message is not JSON */
  }
  return trimmed;
}

/** Trigger a browser download for a Blob (audit export, etc.). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
