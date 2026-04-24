"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRun, fetchRunLogs, fetchRuns, fetchRunTasks, replayDlq, RunItem, TaskItem, triggerRun } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DagView } from "@/components/pipeline/dag-view";
import { Topbar } from "@/components/layout/topbar";
import { NavItem, Sidebar } from "@/components/layout/sidebar";
import { OverviewSection } from "@/components/sections/overview-section";
import { RunsHistorySection } from "@/components/sections/runs-history-section";
import { LogsSection } from "@/components/sections/logs-section";
const TABS = ["Overview", "DAG View", "Runs History", "Config", "Logs"] as const;

export default function HomePage() {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("maintainer-token");
  const [pipelineId, setPipelineId] = useState("demo_pipeline");
  const [runId, setRunId] = useState("");
  const [logKeyword, setLogKeyword] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [runDetail, setRunDetail] = useState<RunItem | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskId, setTaskId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("Dashboard");
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Overview");

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["runs", tenantId, projectId],
    queryFn: () => fetchRuns(tenantId, projectId, token)
  });

  const rows = data?.items ?? [];
  const stats = useMemo(() => {
    const success = rows.filter((r) => String(r.status).toUpperCase() === "SUCCESS").length;
    const failed = rows.filter((r) => String(r.status).toUpperCase() === "FAILED").length;
    const running = rows.filter((r) => String(r.status).toUpperCase() === "RUNNING").length;
    return { success, failed, running };
  }, [rows]);

  const filteredLogs = useMemo(() => {
    if (!logKeyword.trim()) return logs;
    const keyword = logKeyword.toLowerCase();
    return logs.filter((line) => line.toLowerCase().includes(keyword));
  }, [logs, logKeyword]);

  async function loadRunContext(nextRunId: string) {
    setRunId(nextRunId);
    const [run, runTasks, runLogs] = await Promise.all([
      fetchRun(tenantId, projectId, nextRunId, token),
      fetchRunTasks(tenantId, projectId, nextRunId, token),
      fetchRunLogs(tenantId, projectId, nextRunId, token)
    ]);
    setRunDetail(run);
    setTasks(runTasks.items);
    setLogs(runLogs.items.map((x) => `[${x.ts}] ${x.level} ${x.message}`));
  }

  async function onTriggerRun() {
    setStatusMessage("Triggering pipeline...");
    try {
      const run = await triggerRun(tenantId, projectId, token, {
        pipeline_id: pipelineId,
        idempotency_key: `next-ui-${Date.now()}`,
        priority: "normal",
        max_parallel_tasks: 2
      });
      await refetch();
      await loadRunContext(run.run_id);
      setActiveTab("Runs History");
      setStatusMessage(`Triggered run ${run.run_id}`);
    } catch (err) {
      setStatusMessage(`Trigger failed: ${String(err)}`);
    }
  }

  async function onReplayDlq() {
    if (!runId) return;
    try {
      const result = await replayDlq(tenantId, projectId, runId, token);
      await loadRunContext(runId);
      setStatusMessage(`Replay DLQ done: ${result.replayed}`);
    } catch (err) {
      setStatusMessage(`Replay failed: ${String(err)}`);
    }
  }

  useEffect(() => {
    if (!streaming || !runId) return;
    const wsBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080")
      .replace("http://", "ws://")
      .replace("https://", "wss://");
    const ws = new WebSocket(
      `${wsBase}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/logs/ws?token=${encodeURIComponent(token)}`
    );
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { ts: string; level: string; message: string };
        setLogs((prev) => [...prev, `[${parsed.ts}] ${parsed.level} ${parsed.message}`]);
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    };
    ws.onclose = () => setStreaming(false);
    return () => ws.close();
  }, [streaming, runId, tenantId, projectId, token]);

  return (
    <div className="min-h-screen bg-bg-main text-slate-100">
      <Topbar
        tenantId={tenantId}
        projectId={projectId}
        token={token}
        onChangeTenantId={setTenantId}
        onChangeProjectId={setProjectId}
        onChangeToken={setToken}
      />

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-[220px_1fr]">
        <Sidebar activeNav={activeNav} onChange={setActiveNav} />

        <main className="p-6">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Pipeline Detail</h1>
                <p className="text-sm text-slate-400">Modern control plane stack: Next.js + TS + Tailwind + Query + React Flow + Recharts</p>
                <p className="text-xs text-slate-500">{statusMessage || (error ? String(error) : "Ready")}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => refetch()}>Refresh</Button>
                <input
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                  className="w-44 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  placeholder="pipeline_id"
                />
                <Button variant="secondary" onClick={onTriggerRun}>
                  Run Pipeline
                </Button>
                <Button variant="secondary">Edit</Button>
              </div>
            </div>

            <div className="flex gap-2 border-b border-slate-700 pb-3">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-3 py-2 text-sm ${activeTab === tab ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Overview" && (
              <OverviewSection
                tenantId={tenantId}
                projectId={projectId}
                totalRuns={rows.length}
                isFetching={isFetching}
                success={stats.success}
                failed={stats.failed}
                running={stats.running}
              />
            )}

            {activeTab === "DAG View" && (
              <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
                <h2 className="mb-3 text-sm font-semibold text-slate-200">DAG View</h2>
                <DagView
                  tasks={tasks}
                  onClickTask={(nextTaskId) => {
                    setTaskId(nextTaskId);
                    setActiveNav("Tasks");
                    setActiveTab("Logs");
                  }}
                />
              </section>
            )}

            {activeTab === "Runs History" && (
              <RunsHistorySection rows={rows} onSelectRun={loadRunContext} />
            )}

            {activeTab === "Config" && (
              <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
                <h2 className="mb-3 text-sm font-semibold text-slate-200">Pipeline Config</h2>
                <pre className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">{`pipeline_id: demo_pipeline\nproject_id: ${projectId}\ntasks:\n  - prepare\n  - train\n  - evaluate`}</pre>
              </section>
            )}

            {activeTab === "Logs" && (
              <LogsSection
                runId={runId}
                taskId={taskId}
                runDetail={runDetail}
                tasks={tasks}
                logs={filteredLogs}
                logKeyword={logKeyword}
                streaming={streaming}
                onChangeLogKeyword={setLogKeyword}
                onToggleStreaming={() => setStreaming((prev) => !prev)}
                onRefreshRun={() => {
                  if (runId) {
                    void loadRunContext(runId);
                  }
                }}
                onReplayDlq={onReplayDlq}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
