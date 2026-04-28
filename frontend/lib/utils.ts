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
