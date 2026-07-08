/** Display label for MLAir version fields (dataset `vN`, numeric pipeline/model versions). */
export function formatVersionLabel(
  version: string | number | null | undefined,
  fallback = "—",
): string {
  if (version == null || version === "") return fallback;
  const raw = String(version).trim();
  if (!raw) return fallback;
  if (/^v\d+/i.test(raw)) {
    return raw.startsWith("V") ? `v${raw.slice(1)}` : raw;
  }
  if (/^\d+$/.test(raw)) return `v${raw}`;
  return raw;
}
