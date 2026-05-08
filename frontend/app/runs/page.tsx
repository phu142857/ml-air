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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";

export default function RunsPage() {
  const { tenantId, projectId, token } = useAppContext();

  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [compareChartData, setCompareChartData] = useState<Array<Record<string, number | string>>>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState("accuracy");
  const [compareSummary, setCompareSummary] = useState("");
  const [trainingModeFilter, setTrainingModeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    ...realtimeFallbackPolling()
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
  const filteredRuns = allRuns.filter((r) => {
    const modeOk =
      trainingModeFilter === "all" ||
      String(r.training_mode || "full").toLowerCase() === trainingModeFilter;
    const statusOk =
      statusFilter === "all" ||
      String(r.status || "").toLowerCase() === statusFilter;
    return modeOk && statusOk;
  });
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
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Compare Runs (metrics)</CardTitle>

          <div className="flex items-center gap-2">
            <input
              value={selectedMetricKey}
              onChange={(e) => setSelectedMetricKey(e.target.value)}
              placeholder="metric key (e.g. accuracy)"
              className="rounded-lg border border-border bg-card px-6 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />

            <Button onClick={runCompare}>Compare</Button>
          </div>
        </CardHeader>
        <CardContent>

        <div className="mb-3 rounded-lg border border-border bg-muted p-2 text-xs text-foreground">
          {compareSummary || "Summary will appear after compare."}
        </div>

        {compareChartData.length ? (
          <div className="h-72 rounded-xl border border-border bg-card p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="step" stroke="var(--muted-foreground)" tick={{ fill: "var(--muted-foreground)" }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fill: "var(--muted-foreground)" }} />
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
          <div className="flex min-h-16 items-center justify-center rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground">
            Select 2–4 runs and click Compare Selected.
          </div>
        )}
        </CardContent>
      </Card>

      {/* Runs History */}
      <Card>
        <CardContent className="pt-4">
        {/* Pagination */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredRuns.length)} of{" "}
              {filteredRuns.length} runs
            </span>

            <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
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
            <select
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">status: all</option>
              <option value="queued">status: queued</option>
              <option value="running">status: running</option>
              <option value="success">status: success</option>
              <option value="failed">status: failed</option>
              <option value="cancelled">status: cancelled</option>
            </select>
            <Button
              variant="secondary"
              onClick={() =>
                setCurrentPage((prev) => Math.max(1, prev - 1))
              }
              disabled={currentPage === 1 || isLoading}
            >
              {"<<"}
            </Button>

            <span className="px-3 text-sm text-foreground">
              Page {currentPage} / {totalPages}
            </span>

            <Button
              variant="secondary"
              onClick={() =>
                setCurrentPage((prev) =>
                  Math.min(totalPages, prev + 1)
                )
              }
              disabled={currentPage === totalPages || isLoading}
            >
              {">>"}
            </Button>
            </div>
          </div>

        <RunsHistorySection
          rows={paginatedRuns}
          onSelectRun={onSelectRun}
          selectedForCompare={compareRunIds}
          onToggleCompare={toggleCompare}
        />
        </CardContent>
      </Card>
    </RouteShell>
  );
}