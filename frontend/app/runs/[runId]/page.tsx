"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { 
  fetchRun, 
  fetchRunReadiness,
  fetchRunLogs, 
  fetchRunTasks, 
  fetchRunTracking, 
  replayDlq, 
  replayFromTask 
} from "@/lib/api";
import { LogsSection } from "@/components/sections/logs-section";
import { RunTimelineSection } from "@/components/sections/run-timeline-section";
import { RunTrackingSection } from "@/components/sections/run-tracking-section";
import { useAppContext } from "@/lib/app-context";
import { ChevronLeft, RotateCcw, GitBranch, Terminal, Activity, Info, Database } from "lucide-react";

export default function RunDetailPage() {
  const router = useRouter();
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const { tenantId, projectId, token } = useAppContext();
  const [logKeyword, setLogKeyword] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Queries
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun(tenantId, projectId, runId, token)
  });
  const tasksQuery = useQuery({
    queryKey: ["run-tasks", runId],
    queryFn: () => fetchRunTasks(tenantId, projectId, runId, token)
  });
  const logsQuery = useQuery({
    queryKey: ["run-logs", runId],
    queryFn: () => fetchRunLogs(tenantId, projectId, runId, token)
  });
  const trackingQuery = useQuery({
    queryKey: ["run-tracking", runId],
    queryFn: () => fetchRunTracking(tenantId, projectId, runId, token)
  });
  const readinessQuery = useQuery({
    queryKey: ["run-readiness", runId],
    queryFn: () => fetchRunReadiness(tenantId, projectId, runId, token)
  });

  const tasks = tasksQuery.data?.items ?? [];
  const taskId = tasks[0]?.task_id || "";

  const logs = useMemo(() => {
    const all = (logsQuery.data?.items ?? []).map((x) => `[${x.ts}] ${x.level} ${x.message}`);
    if (!logKeyword.trim()) return all;
    return all.filter((line) => line.toLowerCase().includes(logKeyword.toLowerCase()));
  }, [logsQuery.data, logKeyword]);

  const handleRefreshAll = () => {
    void runQuery.refetch();
    void tasksQuery.refetch();
    void logsQuery.refetch();
    void trackingQuery.refetch();
  };

  return (
    <RouteShell activeNav="Runs" title="Run Analysis" subtitle={`ID: ${runId}`}>
      {/* 1. Header Actions */}
      <div className="flex items-center justify-between mb-8">
        <button
          className="group flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          onClick={() => router.push("/runs")}
        >
          <ChevronLeft size={18} /> 
          Back to list
        </button>

        <div className="flex items-center gap-3">
          <a
            href={`/lineage?runId=${encodeURIComponent(runId)}`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition-colors text-sm font-semibold"
          >
            <GitBranch size={16} /> Lineage
          </a>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl hover:border-slate-500 transition-colors text-sm font-semibold"
            onClick={async () => {
              const t = tasks[0]?.task_id;
              if (!t) return;
              const r = await replayFromTask(tenantId, projectId, runId, token, { 
                from_task_id: t, 
                idempotency_key: `replay-${Date.now()}` 
              });
              router.push(`/runs/${r.run_id}`);
            }}
          >
            <RotateCcw size={16} /> Replay Run
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* ==========================================
            PART 1: RUN DETAIL (NẰM TRÊN)
            ========================================== */}
        <div className="grid grid-cols-12 gap-6">
          {/* Timeline - Quan trọng nhất trong phần Detail */}
          <div className="col-span-12 lg:col-span-8">
            <section className="card p-5 shadow-md h-full">
              <RunTimelineSection
                runId={runId}
                tasks={tasks}
                onOpenTask={(tid) => router.push(`/tasks/${tid}`)}
              />
            </section>
          </div>

          {/* Properties - Thông tin định danh */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <section className="card p-5 shadow-md">
              <h2 className="mb-3 text-sm font-semibold text-primary">Run Properties</h2>
              <div className="space-y-3">
                <DetailRow label="Current Status" value={runQuery.data?.status} highlight />
                <DetailRow label="Project ID" value={runQuery.data?.project_id} />
                <DetailRow label="Training Mode" value={runQuery.data?.training_mode || "full"} />
                <DetailRow label="Priority Level" value={runQuery.data?.priority} />
                <DetailRow label="Max Parallel" value={runQuery.data?.max_parallel_tasks} />
              </div>
            </section>
          </div>
        </div>

        {/* Config Snapshot & Tracking Data (Hàng ngang thứ 2 của phần Detail) */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-6">
             <RunTrackingSection tracking={trackingQuery.data ?? null} />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <section className="card p-5 shadow-md h-full">
              <h2 className="mb-3 text-sm font-semibold text-primary">Config Parameters</h2>
              <div className="overflow-auto rounded-xl border border-default max-h-[300px]">
                {runQuery.data?.config_snapshot ? (
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-secondary">
                      <tr>
                        <th className="px-3 py-2 text-left">Parameter</th>
                        <th className="px-3 py-2 text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(runQuery.data.config_snapshot as Record<string, any>).map(([key, value]) => (
                        <tr key={key} className="interactive-row border-t border-default">
                          <td className="px-3 py-2 text-primary font-mono text-xs">{key}</td>
                          <td className="px-3 py-2">
                            <code className="text-xs font-mono text-warning bg-warning/20 px-2 py-1 rounded border border-warning/40 whitespace-pre-wrap break-all block max-w-[300px] overflow-x-auto">
                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-10 text-center text-secondary text-sm">No configuration snapshot available.</div>
                )}
              </div>
            </section>
          </div>
          <div className="col-span-12 lg:col-span-6">
            <section className="card p-5 shadow-md h-full">
              <h2 className="mb-3 text-sm font-semibold text-primary">Readiness Snapshot</h2>
              {!readinessQuery.data ? (
                <div className="p-6 text-center text-secondary text-sm">No readiness snapshot.</div>
              ) : (
                <>
                  <div className="mb-2 text-xs text-slate-200">
                    ready={String(readinessQuery.data.ready)} · mode={readinessQuery.data.training_mode}
                  </div>
                  <div className="overflow-auto rounded-xl border border-default max-h-[260px]">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-secondary">
                        <tr>
                          <th className="px-2 py-1 text-left">Dataset</th>
                          <th className="px-2 py-1 text-left">Actual</th>
                          <th className="px-2 py-1 text-left">Required</th>
                          <th className="px-2 py-1 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(readinessQuery.data.details || []).map((d) => (
                          <tr key={`${d.dataset}-${d.role}`} className="border-t border-default">
                            <td className="px-2 py-1">{d.dataset}</td>
                            <td className="px-2 py-1">{d.actual_size}</td>
                            <td className="px-2 py-1">{d.required_size}</td>
                            <td className="px-2 py-1">{d.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {/* ==========================================
            PART 2: LOGS SECTION (NẰM DƯỚI)
            ========================================== */}
        <LogsSection
          runId={runId}
          taskId={taskId}
          runDetail={runQuery.data ?? null}
          tasks={tasks}
          logs={logs}
          logKeyword={logKeyword}
          streaming={streaming}
          onChangeLogKeyword={setLogKeyword}
          onToggleStreaming={() => setStreaming((prev) => !prev)}
          onRefreshRun={handleRefreshAll}
          onReplayDlq={async () => {
            await replayDlq(tenantId, projectId, runId, token);
            handleRefreshAll();
          }}
        />
      </div>
    </RouteShell>
  );
}

// Component hỗ trợ hiển thị dòng thông tin
function DetailRow({ label, value, highlight = false }: { label: string, value: any, highlight?: boolean }) {
  const getStatusStyles = (val: string) => {
    if (val === 'SUCCESS') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (val === 'FAILED' || val === 'ERROR') return 'text-red-400 bg-red-500/10 border-red-500/20';
    return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  };

  return (
    <div className="flex items-center justify-between border-b border-default py-2 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {highlight ? (
        <span className={`text-xs font-mono px-3 py-1 rounded-lg border shadow-sm ${getStatusStyles(String(value))}`}>
          {value?.toString() || "N/A"}
        </span>
      ) : (
        <span className="text-sm font-medium text-slate-200">{value?.toString() || "N/A"}</span>
      )}
    </div>
  );
}