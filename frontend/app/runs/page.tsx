"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
  const [compareResult, setCompareResult] = useState<string>("");

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
      setCompareResult("Select at least 2 runs for compare.");
      return;
    }
    const result = await compareRunMetrics(tenantId, projectId, compareRunIds, token);
    const grouped = new Map<string, number>();
    result.items.forEach((row) => {
      const k = `${row.run_id}:${row.key}`;
      grouped.set(k, row.value);
    });
    const lines = Array.from(grouped.entries()).map(([k, v]) => `${k} = ${v}`);
    setCompareResult(lines.join("\n") || "No metrics found.");
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
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500" onClick={runCompare}>
            Compare Selected
          </button>
        </div>
        <pre className="min-h-16 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {compareResult || "Select 2-4 runs and click Compare Selected."}
        </pre>
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
