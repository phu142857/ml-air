/** Helpers for run training metric charts (panel layout + series builders). */

export type MetricPoint = { key: string; value: number; step: number };

export type MetricViewType = "line" | "bar" | "area" | "pie" | "list";

export type MetricPanel = {
  id: string;
  viewType: MetricViewType;
  metricKeys: string[];
};

export type MetricsChartPrefs = {
  panels: MetricPanel[];
};

export type MetricsChartScope = {
  tenantId: string;
  projectId: string;
  runId: string;
};

export const METRICS_CHART_PREFS_KEY_LEGACY = "mlair.metrics-chart.prefs.v1";

export const DEFAULT_METRICS_CHART_PREFS: MetricsChartPrefs = {
  panels: [],
};

export const METRIC_VIEW_TYPES: MetricViewType[] = ["line", "bar", "area", "pie", "list"];

export const METRIC_CHART_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c"];

export function metricsChartRunKey(scope: MetricsChartScope): string {
  const tenant = encodeURIComponent(scope.tenantId || "default");
  const project = encodeURIComponent(scope.projectId || "default");
  const run = encodeURIComponent(scope.runId);
  return `mlair:metrics-chart:run:v2:${tenant}:${project}:${run}`;
}

/** @deprecated v2 project bucket — only used to migrate per-run entries. */
function metricsChartProjectKey(scope: Pick<MetricsChartScope, "tenantId" | "projectId">): string {
  const tenant = encodeURIComponent(scope.tenantId || "default");
  const project = encodeURIComponent(scope.projectId || "default");
  return `mlair:metrics-chart:v2:${tenant}:${project}`;
}

export function buildMetricsChartSeries(
  metrics: MetricPoint[],
  keys?: string[],
): Array<Record<string, number | string>> {
  const allowed = keys ? new Set(keys) : null;
  const byStep = new Map<number, Record<string, number | string>>();
  for (const m of metrics) {
    if (allowed && !allowed.has(m.key)) continue;
    const step = m.step ?? 0;
    if (!byStep.has(step)) byStep.set(step, { step: String(step) });
    byStep.get(step)![m.key] = m.value;
  }
  return [...byStep.values()].sort((a, b) => Number(a.step) - Number(b.step));
}

export function metricChartKeys(metrics: MetricPoint[]): string[] {
  const keys = new Set<string>();
  for (const m of metrics) keys.add(m.key);
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function buildCombinedPieData(
  metrics: MetricPoint[],
  keys: string[],
): Array<{ name: string; value: number }> {
  const latest = new Map<string, { step: number; value: number }>();
  for (const m of metrics) {
    if (!keys.includes(m.key)) continue;
    const prev = latest.get(m.key);
    if (!prev || m.step >= prev.step) latest.set(m.key, { step: m.step, value: m.value });
  }
  return keys
    .filter((key) => latest.has(key))
    .map((key) => {
      const point = latest.get(key)!;
      return { name: key, value: Math.abs(point.value) };
    })
    .filter((row) => row.value > 0);
}

export function buildMetricListRows(
  metrics: MetricPoint[],
  keys: string[],
): Array<{ key: string; step: number; value: number }> {
  return metrics
    .filter((m) => keys.includes(m.key))
    .map((m) => ({ key: m.key, step: m.step ?? 0, value: m.value }))
    .sort((a, b) => a.step - b.step || a.key.localeCompare(b.key));
}

export type MetricSummaryRow = {
  key: string;
  pointCount: number;
  firstStep: number;
  lastStep: number;
  latestValue: number;
};

/** One row per metric key for the full run metrics inventory table. */
export function buildAllMetricsSummary(metrics: MetricPoint[]): MetricSummaryRow[] {
  const byKey = new Map<string, MetricSummaryRow>();
  for (const m of metrics) {
    const step = m.step ?? 0;
    const prev = byKey.get(m.key);
    if (!prev) {
      byKey.set(m.key, {
        key: m.key,
        pointCount: 1,
        firstStep: step,
        lastStep: step,
        latestValue: m.value,
      });
      continue;
    }
    prev.pointCount += 1;
    prev.firstStep = Math.min(prev.firstStep, step);
    if (step >= prev.lastStep) {
      prev.lastStep = step;
      prev.latestValue = m.value;
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function metricPanelAssignments(
  panels: MetricPanel[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  panels.forEach((panel, index) => {
    for (const key of panel.metricKeys) {
      const panelsForKey = map.get(key) ?? [];
      panelsForKey.push(index + 1);
      map.set(key, panelsForKey);
    }
  });
  return map;
}

/** Default view for new panels — always line; user can change per panel. */
export function inferDefaultViewType(_metricKey?: string): MetricViewType {
  return "line";
}

/** Pie compares latest values across metrics (parts-of-whole), not time series. */
export function pieChartAllowed(metricKeys: string[]): boolean {
  return metricKeys.length >= 2;
}

export function sanitizePanelViewType(panel: MetricPanel): MetricPanel {
  if (panel.viewType === "pie" && !pieChartAllowed(panel.metricKeys)) {
    return { ...panel, viewType: "line" };
  }
  return panel;
}

const PREFIX_BUCKETS = new Set(["train", "val", "test"]);

/** Bucket metric keys for default reset layout (YOLO-style train/val/test prefixes). */
export function metricPanelBucket(key: string): string {
  const slash = key.indexOf("/");
  if (slash > 0) {
    const prefix = key.slice(0, slash);
    if (PREFIX_BUCKETS.has(prefix.toLowerCase())) return prefix.toLowerCase();
    return prefix.toLowerCase();
  }
  const underscore = key.indexOf("_");
  if (underscore > 0) {
    const prefix = key.slice(0, underscore).toLowerCase();
    if (PREFIX_BUCKETS.has(prefix)) return prefix;
  }
  return key;
}

export function defaultPanels(allKeys: string[]): MetricPanel[] {
  const buckets = new Map<string, string[]>();
  for (const key of allKeys) {
    const bucket = metricPanelBucket(key);
    const list = buckets.get(bucket) ?? [];
    list.push(key);
    buckets.set(bucket, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, keys]) => ({
      id: `panel-${bucket}`,
      viewType: "line" as const,
      metricKeys: [...keys].sort((a, b) => a.localeCompare(b)),
    }));
}

export function defaultPanelsFlat(allKeys: string[]): MetricPanel[] {
  return allKeys.map((key) => ({
    id: `panel-${key}`,
    viewType: "line" as const,
    metricKeys: [key],
  }));
}

export function createPanel(metricKeys: string[] = [], viewType: MetricViewType = "line"): MetricPanel {
  return {
    id: `panel-${Math.random().toString(36).slice(2, 10)}`,
    viewType,
    metricKeys: [...metricKeys],
  };
}

export function reconcilePanels(
  panels: MetricPanel[],
  allKeys: string[],
  options: { assignOrphans?: boolean; allowEmptyPanels?: boolean } = {},
): MetricPanel[] {
  const assignOrphans = options.assignOrphans ?? true;
  const allowEmptyPanels = options.allowEmptyPanels ?? false;
  const keySet = new Set(allKeys);
  const seen = new Set<string>();
  const next: MetricPanel[] = [];

  for (const panel of panels) {
    const metricKeys = panel.metricKeys.filter((key) => keySet.has(key) && !seen.has(key));
    for (const key of metricKeys) seen.add(key);
    if (metricKeys.length > 0 || allowEmptyPanels) {
      next.push(sanitizePanelViewType({
        id: panel.id,
        viewType: METRIC_VIEW_TYPES.includes(panel.viewType) ? panel.viewType : "line",
        metricKeys,
      }));
    }
  }

  if (assignOrphans) {
    for (const key of allKeys) {
      if (seen.has(key)) continue;
      next.push(sanitizePanelViewType({
        id: `panel-${key}`,
        viewType: "line",
        metricKeys: [key],
      }));
    }
  }

  return next.length > 0 ? next : defaultPanels(allKeys);
}

export function assignMetricToPanel(
  panels: MetricPanel[],
  panelId: string,
  metricKey: string,
): MetricPanel[] {
  return panels.map((panel) => {
    const without = panel.metricKeys.filter((key) => key !== metricKey);
    if (panel.id !== panelId) return { ...panel, metricKeys: without };
    return { ...panel, metricKeys: [...without, metricKey] };
  });
}

export function toggleMetricInPanel(
  panels: MetricPanel[],
  panelId: string,
  metricKey: string,
): MetricPanel[] {
  const target = panels.find((panel) => panel.id === panelId);
  if (!target) return panels;
  if (target.metricKeys.includes(metricKey)) {
    return panels.map((panel) =>
      panel.id === panelId
        ? { ...panel, metricKeys: panel.metricKeys.filter((key) => key !== metricKey) }
        : panel,
    );
  }
  return assignMetricToPanel(panels, panelId, metricKey);
}

export function panelTitle(panel: MetricPanel, index: number): string {
  if (panel.metricKeys.length === 1) return panel.metricKeys[0];
  if (panel.metricKeys.length > 1) {
    const bucket = metricPanelBucket(panel.metricKeys[0]);
    if (panel.metricKeys.every((key) => metricPanelBucket(key) === bucket) && bucket !== panel.metricKeys[0]) {
      return bucket;
    }
    return panel.metricKeys.join(", ");
  }
  return `Panel ${index + 1}`;
}

type LegacyPrefs = {
  layout?: string;
  defaultChartType?: string;
  selectedKeys?: string[] | null;
  perMetricTypes?: Record<string, string>;
  panels?: MetricPanel[];
};

function normalizePanel(raw: Partial<MetricPanel> | undefined): MetricPanel | null {
  if (!raw?.id) return null;
  const metricKeys = Array.isArray(raw.metricKeys) ? raw.metricKeys.map(String) : [];
  const viewType = METRIC_VIEW_TYPES.includes(raw.viewType as MetricViewType)
    ? (raw.viewType as MetricViewType)
    : "line";
  return { id: String(raw.id), viewType, metricKeys };
}

function normalizePrefs(raw: LegacyPrefs | undefined, allKeys: string[]): MetricsChartPrefs {
  if (raw?.panels?.length) {
    const panels = raw.panels
      .map((panel) => normalizePanel(panel))
      .filter((panel): panel is MetricPanel => panel !== null);
    return { panels: reconcilePanels(panels, allKeys) };
  }

  if (raw?.layout === "split" && raw.perMetricTypes) {
    const keys = raw.selectedKeys?.length
      ? raw.selectedKeys
      : allKeys;
    const panels = keys.map((key) => ({
      id: `panel-${key}`,
      viewType: (METRIC_VIEW_TYPES.includes(raw.perMetricTypes?.[key] as MetricViewType)
        ? raw.perMetricTypes![key]
        : "line") as MetricViewType,
      metricKeys: [key],
    }));
    return { panels: reconcilePanels(panels, allKeys) };
  }

  if (raw?.layout === "combined") {
    const keys = raw.selectedKeys?.length ? raw.selectedKeys : allKeys;
    const viewType = METRIC_VIEW_TYPES.includes(raw.defaultChartType as MetricViewType)
      ? (raw.defaultChartType as MetricViewType)
      : "line";
    if (keys.length > 0) {
      return {
        panels: [{ id: "panel-combined", viewType, metricKeys: keys }],
      };
    }
  }

  return { panels: defaultPanels(allKeys) };
}

function loadLegacyPrefs(): LegacyPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(METRICS_CHART_PREFS_KEY_LEGACY);
    return raw ? (JSON.parse(raw) as LegacyPrefs) : null;
  } catch {
    return null;
  }
}

function loadFromV2ProjectBucket(scope: MetricsChartScope): LegacyPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(metricsChartProjectKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { runs?: Record<string, LegacyPrefs> };
    return parsed.runs?.[scope.runId] ?? null;
  } catch {
    return null;
  }
}

export function loadMetricsChartPrefs(scope: MetricsChartScope, allKeys: string[]): MetricsChartPrefs {
  if (typeof window === "undefined") return { panels: defaultPanels(allKeys) };
  try {
    const raw = window.localStorage.getItem(metricsChartRunKey(scope));
    if (raw) return normalizePrefs(JSON.parse(raw) as LegacyPrefs, allKeys);
  } catch {
    /* fall through */
  }
  const migrated =
    loadFromV2ProjectBucket(scope) ??
    loadLegacyPrefs() ??
    undefined;
  return normalizePrefs(migrated, allKeys);
}

export function saveMetricsChartPrefs(scope: MetricsChartScope, prefs: MetricsChartPrefs): void {
  if (typeof window === "undefined" || !scope.runId) return;
  try {
    window.localStorage.setItem(metricsChartRunKey(scope), JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}
