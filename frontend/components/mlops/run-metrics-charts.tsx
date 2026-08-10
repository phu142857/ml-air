"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { cn } from "@/lib/utils";
import {
  assignMetricToPanel,
  buildAllMetricsSummary,
  buildCombinedPieData,
  buildMetricListRows,
  buildMetricsChartSeries,
  createPanel,
  defaultPanels,
  defaultPanelsFlat,
  loadMetricsChartPrefs,
  METRIC_CHART_COLORS,
  METRIC_VIEW_TYPES,
  metricChartKeys,
  metricPanelAssignments,
  panelTitle,
  pieChartAllowed,
  reconcilePanels,
  sanitizePanelViewType,
  saveMetricsChartPrefs,
  type MetricPanel,
  type MetricPoint,
  type MetricsChartPrefs,
  type MetricsChartScope,
  type MetricViewType,
} from "@/lib/metrics-chart";

type Props = {
  metrics: MetricPoint[];
  tenantId: string;
  projectId: string;
  runId: string;
};

const VIEW_TYPE_LABEL: Record<MetricViewType, string> = {
  line: "Line",
  bar: "Bar",
  area: "Area",
  pie: "Pie",
  list: "List",
};

const MANUAL_PANEL_OPTS = { assignOrphans: false, allowEmptyPanels: true } as const;

function MetricPieChart({
  data,
  heightClassName = "h-[320px]",
  caption,
}: {
  data: Array<{ name: string; value: number }>;
  heightClassName?: string;
  caption?: string;
}) {
  const chartTheme = useChartTheme();
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No positive values to chart.</p>;
  }

  return (
    <div className="space-y-2">
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      <div className={cn("w-full", heightClassName)}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="78%"
              isAnimationActive={false}
            >
              {data.map((row, i) => (
                <Cell key={row.name} fill={METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricSeriesChart({
  data,
  viewType,
  metricKeys,
  heightClassName = "h-[320px]",
}: {
  data: Array<Record<string, number | string>>;
  viewType: Exclude<MetricViewType, "pie" | "list">;
  metricKeys: string[];
  heightClassName?: string;
}) {
  const chartTheme = useChartTheme();

  const common = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 0 },
  } as const;

  const axis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
      <XAxis dataKey="step" stroke={chartTheme.axisStroke} tick={{ fontSize: 11 }} />
      <YAxis stroke={chartTheme.axisStroke} tick={{ fontSize: 11 }} width={44} />
      <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, borderRadius: 8, fontSize: 12 }} />
    </>
  );

  return (
    <div className={cn("w-full", heightClassName)}>
      <ResponsiveContainer width="100%" height="100%">
        {viewType === "bar" ? (
          <BarChart {...common}>
            {axis}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metricKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                fill={METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : viewType === "area" ? (
          <AreaChart {...common}>
            {axis}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metricKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length]}
                fill={METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length]}
                fillOpacity={0.2}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axis}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metricKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function MetricListTable({
  rows,
  className,
}: {
  rows: Array<{ key: string; step: number; value: number }>;
  className?: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No rows for this panel.</p>;
  }

  return (
    <div className={cn("overflow-auto rounded-lg border border-border/70", className)}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Metric</th>
            <th className="px-3 py-2">Step</th>
            <th className="px-3 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.key}-${row.step}-${i}`} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-1.5 font-mono text-xs">{row.key}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{row.step}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllMetricsInventory({
  metrics,
  panelAssignments,
  filterQuery,
}: {
  metrics: MetricPoint[];
  panelAssignments: Map<string, number[]>;
  filterQuery: string;
}) {
  const rows = useMemo(() => buildAllMetricsSummary(metrics), [metrics]);
  const q = filterQuery.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? rows.filter((row) => row.key.toLowerCase().includes(q)) : rows),
    [rows, q],
  );

  if (!filtered.length) {
    return (
      <div className="panel-surface px-4 py-8 text-center text-sm text-muted-foreground">
        No metrics match this filter.
      </div>
    );
  }

  return (
    <div className="panel-surface">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">All metrics</p>
        <p className="text-xs text-muted-foreground">
          {rows.length} metric{rows.length === 1 ? "" : "s"} logged for this run
        </p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2">Metric</th>
              <th className="px-4 py-2">Points</th>
              <th className="px-4 py-2">Steps</th>
              <th className="px-4 py-2">Latest</th>
              <th className="px-4 py-2">Panels</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const panels = panelAssignments.get(row.key);
              return (
                <tr key={row.key} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{row.key}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.pointCount}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.firstStep === row.lastStep ? row.lastStep : `${row.firstStep}–${row.lastStep}`}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">{row.latestValue}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {panels?.length ? panels.map((n) => `#${n}`).join(", ") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricPickerSearch({
  allKeys,
  selectedKeys,
  onAdd,
}: {
  allKeys: string[];
  selectedKeys: string[];
  onAdd: (metricKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allKeys
      .filter((key) => !selectedKeys.includes(key))
      .filter((key) => !q || key.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allKeys, selectedKeys, query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search metrics to add…"
          className="h-8 pl-8 text-xs"
        />
      </div>
      {open && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {suggestions.map((key) => (
            <button
              key={key}
              type="button"
              className="flex w-full rounded-md px-2 py-1.5 text-left font-mono text-[11px] hover:bg-accent"
              onClick={() => {
                onAdd(key);
                setQuery("");
                setOpen(false);
              }}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}
      {open && query.trim() && suggestions.length === 0 ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          No matching metrics
        </div>
      ) : null}
    </div>
  );
}

function MetricPanelCard({
  panel,
  index,
  allKeys,
  metrics,
  onViewTypeChange,
  onAddMetric,
  onRemoveMetric,
  onRemove,
  canRemove,
}: {
  panel: MetricPanel;
  index: number;
  allKeys: string[];
  metrics: MetricPoint[];
  onViewTypeChange: (viewType: MetricViewType) => void;
  onAddMetric: (metricKey: string) => void;
  onRemoveMetric: (metricKey: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const series = useMemo(
    () => buildMetricsChartSeries(metrics, panel.metricKeys),
    [metrics, panel.metricKeys],
  );
  const pieData = useMemo(
    () => buildCombinedPieData(metrics, panel.metricKeys),
    [metrics, panel.metricKeys],
  );
  const listRows = useMemo(
    () => buildMetricListRows(metrics, panel.metricKeys),
    [metrics, panel.metricKeys],
  );
  const pieAllowed = pieChartAllowed(panel.metricKeys);
  const effectiveViewType =
    panel.viewType === "pie" && !pieAllowed ? "line" : panel.viewType;

  return (
    <div className="panel-surface w-full p-3">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Panel {index + 1}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{panelTitle(panel, index)}</p>
          <p className="text-[11px] text-muted-foreground">
            {panel.metricKeys.length} metric{panel.metricKeys.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={effectiveViewType}
            onValueChange={(value) => onViewTypeChange(value as MetricViewType)}
          >
            <SelectTrigger className="h-8 w-[108px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRIC_VIEW_TYPES.map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  className="text-xs capitalize"
                  disabled={type === "pie" && !pieAllowed}
                >
                  {VIEW_TYPE_LABEL[type]}
                  {type === "pie" && !pieAllowed ? " (2+ metrics)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canRemove ? (
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 space-y-2">
        <MetricPickerSearch
          allKeys={allKeys}
          selectedKeys={panel.metricKeys}
          onAdd={onAddMetric}
        />
        {panel.metricKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {panel.metricKeys.map((key) => (
              <Badge key={key} variant="secondary" className="gap-1 pr-1 font-mono text-[10px]">
                {key}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove ${key}`}
                  onClick={() => onRemoveMetric(key)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Search and add metrics to this panel.</p>
        )}
      </div>

      {panel.metricKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chart until metrics are added.</p>
      ) : effectiveViewType === "list" ? (
        <MetricListTable rows={listRows} className="max-h-[420px]" />
      ) : effectiveViewType === "pie" ? (
        <MetricPieChart
          data={pieData}
          caption="Latest value per metric (parts of whole at final step)."
        />
      ) : (
        <MetricSeriesChart
          data={series}
          viewType={effectiveViewType}
          metricKeys={panel.metricKeys}
        />
      )}
    </div>
  );
}

export function RunMetricsCharts({ metrics, tenantId, projectId, runId }: Props) {
  const scope = useMemo<MetricsChartScope>(
    () => ({ tenantId, projectId, runId }),
    [tenantId, projectId, runId],
  );

  const allKeys = useMemo(() => metricChartKeys(metrics), [metrics]);

  const [prefs, setPrefs] = useState<MetricsChartPrefs>(() =>
    loadMetricsChartPrefs(scope, allKeys),
  );
  const [inventoryFilter, setInventoryFilter] = useState("");

  const assignments = useMemo(() => metricPanelAssignments(prefs.panels), [prefs.panels]);

  useEffect(() => {
    setPrefs(loadMetricsChartPrefs(scope, allKeys));
  }, [scope, allKeys]);

  useEffect(() => {
    setPrefs((prev) => ({
      panels: reconcilePanels(prev.panels, allKeys, MANUAL_PANEL_OPTS),
    }));
  }, [allKeys]);

  useEffect(() => {
    saveMetricsChartPrefs(scope, prefs);
  }, [scope, prefs]);

  const updatePanel = useCallback((panelId: string, patch: Partial<MetricPanel>) => {
    setPrefs((prev) => ({
      panels: prev.panels.map((panel) =>
        panel.id === panelId ? sanitizePanelViewType({ ...panel, ...patch }) : panel,
      ),
    }));
  }, []);

  const addPanel = useCallback(() => {
    setPrefs((prev) => ({
      panels: [...prev.panels, createPanel()],
    }));
  }, []);

  const resetPanelsByPrefix = useCallback(() => {
    setPrefs({ panels: defaultPanels(allKeys) });
  }, [allKeys]);

  const resetPanelsFlat = useCallback(() => {
    setPrefs({ panels: defaultPanelsFlat(allKeys) });
  }, [allKeys]);

  const removePanel = useCallback((panelId: string) => {
    setPrefs((prev) => ({
      panels: reconcilePanels(
        prev.panels.filter((panel) => panel.id !== panelId),
        allKeys,
        MANUAL_PANEL_OPTS,
      ),
    }));
  }, [allKeys]);

  const addMetricToPanel = useCallback((panelId: string, metricKey: string) => {
    setPrefs((prev) => ({
      panels: reconcilePanels(
        assignMetricToPanel(prev.panels, panelId, metricKey).map(sanitizePanelViewType),
        allKeys,
        MANUAL_PANEL_OPTS,
      ),
    }));
  }, [allKeys]);

  const removeMetricFromPanel = useCallback((panelId: string, metricKey: string) => {
    setPrefs((prev) => ({
      panels: reconcilePanels(
        prev.panels.map((panel) =>
          panel.id === panelId
            ? sanitizePanelViewType({
                ...panel,
                metricKeys: panel.metricKeys.filter((key) => key !== metricKey),
              })
            : panel,
        ),
        allKeys,
        MANUAL_PANEL_OPTS,
      ),
    }));
  }, [allKeys]);

  if (!allKeys.length) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={inventoryFilter}
              onChange={(event) => setInventoryFilter(event.target.value)}
              placeholder="Filter all metrics…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addPanel}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add panel
          </Button>
        </div>
        <AllMetricsInventory
          metrics={metrics}
          panelAssignments={assignments}
          filterQuery={inventoryFilter}
        />
      </div>

      {prefs.panels.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={resetPanelsByPrefix}>
              Reset (by prefix)
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={resetPanelsFlat}>
              Reset (1 metric / panel)
            </Button>
          </div>
          {prefs.panels.map((panel, index) => (
            <MetricPanelCard
              key={panel.id}
              panel={panel}
              index={index}
              allKeys={allKeys}
              metrics={metrics}
              canRemove
              onViewTypeChange={(viewType) => updatePanel(panel.id, { viewType })}
              onAddMetric={(metricKey) => addMetricToPanel(panel.id, metricKey)}
              onRemoveMetric={(metricKey) => removeMetricFromPanel(panel.id, metricKey)}
              onRemove={() => removePanel(panel.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
