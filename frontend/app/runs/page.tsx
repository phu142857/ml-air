"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { RouteShell } from "@/components/layout/route-shell";
import { compareRunMetrics, fetchRuns } from "@/lib/api";
import { RunsHistorySection } from "@/components/sections/runs-history-section";
import { useAppContext } from "@/lib/app-context";

export default function RunsPage() {
  const { tenantId, projectId, token } = useAppContext();

  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [compareChartData, setCompareChartData] = useState<Array<Record<string, number | string>>>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState("accuracy");
  const [compareSummary, setCompareSummary] = useState("");
  const [trainingModeFilter, setTrainingModeFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["runs", tenantId, projectId],
    queryFn: () => fetchRuns(tenantId, projectId, token)
  });

  function onSelectRun(runId: string) {
    window.location.href = `/runs/${runId}`;
  }

  function toggleCompare(runId: string) {
    setCompareRunIds((prev) =>
      prev.includes(runId)
        ? prev.filter((x) => x !== runId)
        : [...prev, runId].slice(-4)
    );
  }

  async function runCompare() {
    if (compareRunIds.length < 2) {
      setCompareChartData([]);
      setCompareSummary("Select at least 2 runs.");
      return;
    }

    const result = await compareRunMetrics(
      tenantId,
      projectId,
      compareRunIds,
      token
    );

    const grouped = new Map<number, Record<string, number | string>>();
    const stats = new Map<string, { last: number; best: number }>();

    result.items.forEach((row) => {
      if (row.key !== selectedMetricKey) return;

      const stepKey = row.step ?? 0;
      const existing = grouped.get(stepKey) ?? { step: stepKey };

      existing[row.run_id] = row.value;
      grouped.set(stepKey, existing);

      const current = stats.get(row.run_id);
      if (!current) {
        stats.set(row.run_id, { last: row.value, best: row.value });
      } else {
        stats.set(row.run_id, {
          last: row.value,
          best: Math.max(current.best, row.value)
        });
      }
    });

    const chart = Array.from(grouped.values()).sort(
      (a, b) => Number(a.step) - Number(b.step)
    );

    setCompareChartData(chart);

    const summary = Array.from(stats.entries())
      .map(
        ([run, v]) =>
          `${run}: last=${v.last.toFixed(4)} best=${v.best.toFixed(4)}`
      )
      .join(" | ");

    setCompareSummary(
      summary || `No metric '${selectedMetricKey}' found on selected runs.`
    );
  }

  const allRuns = data?.items ?? [];
  const filteredRuns =
    trainingModeFilter === "all"
      ? allRuns
      : allRuns.filter((r) => String(r.training_mode || "full").toLowerCase() === trainingModeFilter);
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSize));
  const paginatedRuns = filteredRuns.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const COLORS = ["#3B82F6", "#16A34A", "#F59E0B", "#EC4899", "#06B6D4"];

  return (
    <RouteShell
      activeNav="Runs"
      title="Runs"
      subtitle="Run history and metrics comparison"
    >
      {/* Compare Section */}
      <section className="card p-5 mb-4 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">
            Compare Runs (metrics)
          </h2>

          <div className="flex items-center gap-2">
            <input
              value={selectedMetricKey}
              onChange={(e) => setSelectedMetricKey(e.target.value)}
              placeholder="metric key (e.g. accuracy)"
              className="rounded-lg border border-default bg-surface px-6 py-2 text-sm text-primary placeholder:!text-secondary"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />

            <button className="rounded-lg bg-color-primary px-4 py-2 text-sm text-white hover:opacity-80" onClick={runCompare}>
              Compare
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-default bg-muted p-2 text-xs text-primary">
          {compareSummary || "Summary will appear after compare."}
        </div>

        {compareChartData.length ? (
          <div className="h-72 rounded-xl border border-default bg-surface p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="step" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip />
                <Legend />

                {Object.keys(compareChartData[0] || {})
                  .filter((k) => k !== "step")
                  .map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      dot={false}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="min-h-16 flex items-center justify-center rounded-xl border border-default bg-muted p-3 text-xs text-disabled">
            Select 2–4 runs and click Compare Selected.
          </div>
        )}
      </section>

      {/* Runs History */}
      <section className="card p-5">
        {/* Pagination */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-secondary">
            Showing {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, filteredRuns.length)} of{" "}
            {filteredRuns.length} runs
          </div>

          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-default bg-surface px-2 py-1 text-xs text-primary"
              value={trainingModeFilter}
              onChange={(e) => {
                setTrainingModeFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">mode: all</option>
              <option value="quick">mode: quick</option>
              <option value="standard">mode: standard</option>
              <option value="full">mode: full</option>
            </select>
            <button
              className="button-secondary"
              onClick={() =>
                setCurrentPage((prev) => Math.max(1, prev - 1))
              }
              disabled={currentPage === 1 || isLoading}
            >
              Previous
            </button>

            <span className="px-3 text-sm text-primary">
              Page {currentPage} / {totalPages}
            </span>

            <button
              className="button-secondary"
              onClick={() =>
                setCurrentPage((prev) =>
                  Math.min(totalPages, prev + 1)
                )
              }
              disabled={currentPage === totalPages || isLoading}
            >
              Next
            </button>
          </div>
        </div>

        <RunsHistorySection
          rows={paginatedRuns}
          onSelectRun={onSelectRun}
          selectedForCompare={compareRunIds}
          onToggleCompare={toggleCompare}
        />
      </section>
    </RouteShell>
  );
}