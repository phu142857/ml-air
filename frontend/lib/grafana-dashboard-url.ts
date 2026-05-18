/** Build Grafana dashboard URL from runtime-config base + provisioned JSON filename. */
export function grafanaDashboardUrl(
  grafanaBaseUrl: string | null | undefined,
  dashboardFilename: string,
): string | null {
  const base = String(grafanaBaseUrl || "").trim().replace(/\/$/, "");
  if (!base) return null;
  const slug = dashboardFilename.replace(/\.json$/i, "").trim();
  if (!slug) return null;
  return `${base}/d/${encodeURIComponent(slug)}/${encodeURIComponent(slug)}`;
}
