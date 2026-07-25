import { describe, expect, it } from "vitest";

import {
  assignMetricToPanel,
  buildAllMetricsSummary,
  buildCombinedPieData,
  buildMetricListRows,
  buildMetricsChartSeries,
  defaultPanels,
  defaultPanelsFlat,
  inferDefaultViewType,
  loadMetricsChartPrefs,
  metricChartKeys,
  metricPanelAssignments,
  metricsChartRunKey,
  pieChartAllowed,
  reconcilePanels,
  sanitizePanelViewType,
  saveMetricsChartPrefs,
  toggleMetricInPanel,
  DEFAULT_METRICS_CHART_PREFS,
} from "./metrics-chart";

describe("metrics-chart", () => {
  const metrics = [
    { key: "loss", value: 1.2, step: 0 },
    { key: "loss", value: 0.8, step: 1 },
    { key: "accuracy", value: 0.5, step: 0 },
    { key: "accuracy", value: 0.9, step: 1 },
    { key: "box_count", value: 12, step: 1 },
  ];

  const scope = { tenantId: "yolo", projectId: "yoloVN", runId: "run-1" };
  const allKeys = ["accuracy", "box_count", "loss"];

  it("builds combined series by step", () => {
    expect(buildMetricsChartSeries(metrics)).toEqual([
      { step: "0", loss: 1.2, accuracy: 0.5 },
      { step: "1", loss: 0.8, accuracy: 0.9, box_count: 12 },
    ]);
  });

  it("lists sorted metric keys", () => {
    expect(metricChartKeys(metrics)).toEqual(allKeys);
  });

  it("builds pie and list datasets", () => {
    expect(buildCombinedPieData(metrics, ["loss", "accuracy"])).toEqual([
      { name: "loss", value: 0.8 },
      { name: "accuracy", value: 0.9 },
    ]);
    expect(buildMetricListRows(metrics, ["loss"])).toEqual([
      { key: "loss", step: 0, value: 1.2 },
      { key: "loss", step: 1, value: 0.8 },
    ]);
  });

  it("defaults all new panels to line chart", () => {
    expect(inferDefaultViewType("train_loss")).toBe("line");
    expect(inferDefaultViewType("detection_count")).toBe("line");
    expect(inferDefaultViewType("recall_pct")).toBe("line");
    expect(inferDefaultViewType("class_distribution")).toBe("line");
  });

  it("groups metrics by slash prefix on reset", () => {
    const keys = ["train/loss", "train/cls_loss", "val/loss", "val/map50"];
    const panels = defaultPanels(keys);
    expect(panels).toHaveLength(2);
    expect(panels[0].metricKeys).toEqual(["train/cls_loss", "train/loss"]);
    expect(panels[1].metricKeys).toEqual(["val/loss", "val/map50"]);
    expect(panels.every((panel) => panel.viewType === "line")).toBe(true);
  });

  it("creates one panel per metric on flat reset", () => {
    const panels = defaultPanelsFlat(allKeys);
    expect(panels).toHaveLength(3);
    expect(panels.map((panel) => panel.metricKeys[0]).sort()).toEqual(allKeys);
    expect(panels.every((panel) => panel.viewType === "line")).toBe(true);
  });

  it("restricts pie chart to two or more metrics", () => {
    expect(pieChartAllowed(["loss"])).toBe(false);
    expect(pieChartAllowed(["loss", "accuracy"])).toBe(true);
    expect(
      sanitizePanelViewType({ id: "p1", viewType: "pie", metricKeys: ["loss"] }).viewType,
    ).toBe("line");
  });

  it("summarizes all metrics for inventory table", () => {
    const summary = buildAllMetricsSummary(metrics);
    expect(summary).toHaveLength(3);
    const loss = summary.find((row) => row.key === "loss");
    expect(loss).toMatchObject({ pointCount: 2, firstStep: 0, lastStep: 1, latestValue: 0.8 });
  });

  it("maps metrics to panel numbers", () => {
    const panels = defaultPanels(["train/loss", "train/cls_loss", "val/loss"]);
    const map = metricPanelAssignments(panels);
    expect(map.get("train/loss")).toEqual([1]);
    expect(map.get("val/loss")).toEqual([2]);
  });

  it("keeps unassigned metrics when orphan assignment is disabled", () => {
    const panels = reconcilePanels(
      [
        { id: "p1", viewType: "line", metricKeys: ["loss"] },
        { id: "p2", viewType: "line", metricKeys: [] },
      ],
      ["loss", "accuracy"],
      { assignOrphans: false, allowEmptyPanels: true },
    );
    expect(panels).toHaveLength(2);
    expect(panels.some((panel) => panel.metricKeys.includes("accuracy"))).toBe(false);
  });

  it("creates default panels for ungrouped metric names", () => {
    const panels = defaultPanels(allKeys);
    expect(panels).toHaveLength(3);
    expect(panels[2].metricKeys).toEqual(["loss"]);
    expect(panels[2].viewType).toBe("line");
  });

  it("moves metrics between panels", () => {
    const panels = [
      { id: "p1", viewType: "line" as const, metricKeys: ["loss"] },
      { id: "p2", viewType: "line" as const, metricKeys: ["accuracy"] },
    ];
    const grouped = assignMetricToPanel(panels, "p1", "accuracy");
    expect(grouped[0].metricKeys.sort()).toEqual(["accuracy", "loss"]);
    expect(grouped[1].metricKeys).toEqual([]);
  });

  it("toggles metric membership in a panel", () => {
    const panels = [
      { id: "p1", viewType: "line" as const, metricKeys: ["loss"] },
      { id: "p2", viewType: "line" as const, metricKeys: ["accuracy"] },
    ];
    const removed = toggleMetricInPanel(panels, "p1", "loss");
    expect(removed[0].metricKeys).toEqual([]);
    const added = toggleMetricInPanel(removed, "p2", "loss");
    expect(added[1].metricKeys).toEqual(["accuracy", "loss"]);
  });

  it("persists panel layout per run", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    try {
      const panels = [
        { id: "p1", viewType: "list" as const, metricKeys: ["loss"] },
        { id: "p2", viewType: "pie" as const, metricKeys: ["accuracy", "box_count"] },
      ];
      saveMetricsChartPrefs(scope, { panels });
      expect(loadMetricsChartPrefs(scope, allKeys).panels).toHaveLength(2);
      expect(loadMetricsChartPrefs({ ...scope, runId: "run-2" }, allKeys).panels).toHaveLength(0);
      expect(store.has(metricsChartRunKey(scope))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("reconciles panels when metric keys change", () => {
    const panels = reconcilePanels(
      [{ id: "p1", viewType: "bar", metricKeys: ["loss", "stale"] }],
      ["loss", "accuracy"],
    );
    expect(panels.some((panel) => panel.metricKeys.includes("accuracy"))).toBe(true);
    expect(panels.some((panel) => panel.metricKeys.includes("stale"))).toBe(false);
  });

  it("has empty default prefs before keys exist", () => {
    expect(DEFAULT_METRICS_CHART_PREFS.panels).toEqual([]);
  });
});
