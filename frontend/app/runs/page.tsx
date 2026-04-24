"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RouteShell } from "@/components/layout/route-shell";
import { LogsSection } from "@/components/sections/logs-section";
import { compareRunMetrics, fetchRun, fetchRunLogs, fetchRuns, fetchRunTasks, replayDlq } from "@/lib/api";
import { RunsHistorySection } from "@/components/sections/runs-history-section";
import { useAppContext } from "@/lib/app-context";

export default function RunsPage() {
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const [runId, setRunId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [logKeyword, setLogKeyword] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [compareChartData, setCompareChartData] = useState<Array<Record<string, number | string>>>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState("accuracy");
  const [compareSummary, setCompareSummary] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["runs", tenantId, projectId],
    queryFn: () => fetchRuns(tenantId, projectId, token)
  });

  async function loadRunContext(nextRunId: string) {
    router.push(`/runs/${nextRunId}`);
    setRunId(nextRunId);
    const [run, runTasks, runLogs] = await Promise.all([
      fetchRun(tenantId, projectId, nextRunId, token),
      fetchRunTasks(tenantId, projectId, nextRunId, token),
      fetchRunLogs(tenantId, projectId, nextRunId, token)
    ]);
    setRunDetail(run);
    setTasks(runTasks.items);
    setTaskId(runTasks.items[0]?.task_id || "");
    setLogs(runLogs.items.map((x) => `[${x.ts}] ${x.level} ${x.message}`));
  }

  function toggleCompare(runId: string) {
    setCompareRunIds((prev) => (prev.includes(runId) ? prev.filter((x) => x !== runId) : [...prev, runId].slice(-4)));
  }

  async function runCompare() {
    if (compareRunIds.length < 2) {
      setCompareChartData([]);
      return;
    }
    const result = await compareRunMetrics(tenantId, projectId, compareRunIds, token);
    const grouped = new Map<number, Record<string, number | string>>();
    const stats = new Map<string, { last: number; best: number }>();
    result.items.forEach((row) => {
      if (row.key !== selectedMetricKey) return;
      const stepKey = row.step ?? 0;
      const existing = grouped.get(stepKey) ?? { step: stepKey };
      existing[row.run_id] = row.value;
      grouped.set(stepKey, existing);

      const current = stats.get(row.run_id);
      if (!current) stats.set(row.run_id, { last: row.value, best: row.value });
      else stats.set(row.run_id, { last: row.value, best: Math.max(current.best, row.value) });
    });
    setCompareChartData(Array.from(grouped.values()).sort((a, b) => Number(a.step) - Number(b.step)));
    const summary = Array.from(stats.entries())
      .map(([run, v]) => `${run}: last=${v.last.toFixed(4)} best=${v.best.toFixed(4)}`)
      .join(" | ");
    setCompareSummary(summary || `No metric '${selectedMetricKey}' found on selected runs.`);
  }

  return (
    <RouteShell activeNav="Runs" title="Runs" subtitle="Run history and drill-down detail">
      <RunsHistorySection
        rows={data?.items ?? []}
        onSelectRun={loadRunContext}
        selectedForCompare={compareRunIds}
        onToggleCompare={toggleCompare}
      />
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Compare Runs (metrics)</h2>
          <div className="flex items-center gap-2">
            <input
              value={selectedMetricKey}
              onChange={(e) => setSelectedMetricKey(e.target.value)}
              placeholder="metric key (e.g. accuracy)"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            />
            <button
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500"
              onClick={runCompare}
            >
              Compare Selected
            </button>
          </div>
        </div>
        <div className="mb-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300">
          {compareSummary || "Summary will appear after compare."}
        </div>
        {compareChartData.length ? (
          <div className="h-72 rounded-xl border border-slate-700 bg-slate-900 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="step" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
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
                      stroke={["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#22d3ee"][idx % 5]}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <pre className="min-h-16 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
            Select 2-4 runs and click Compare Selected.
          </pre>
        )}
      </section>
      <LogsSection
        runId={runId}
        taskId={taskId}
        runDetail={runDetail}
        tasks={tasks}
        logs={logKeyword ? logs.filter((line) => line.toLowerCase().includes(logKeyword.toLowerCase())) : logs}
        logKeyword={logKeyword}
        streaming={streaming}
        onChangeLogKeyword={setLogKeyword}
        onToggleStreaming={() => setStreaming((prev) => !prev)}
        onRefreshRun={() => {
          if (runId) {
            void loadRunContext(runId);
          }
        }}
        onReplayDlq={async () => {
          if (!runId) return;
          await replayDlq(tenantId, projectId, runId, token);
          await loadRunContext(runId);
        }}
      />
    </RouteShell>
  );
}
