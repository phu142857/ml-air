"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchRun, fetchRunLogs, fetchRunTasks, fetchRunTracking, replayDlq, replayFromTask } from "@/lib/api";
import { LogsSection } from "@/components/sections/logs-section";
import { RunTimelineSection } from "@/components/sections/run-timeline-section";
import { RunTrackingSection } from "@/components/sections/run-tracking-section";
import { useAppContext } from "@/lib/app-context";

export default function RunDetailPage() {
  const router = useRouter();
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const { tenantId, projectId, token } = useAppContext();
  const [logKeyword, setLogKeyword] = useState("");
  const [streaming, setStreaming] = useState(false);

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

  const tasks = tasksQuery.data?.items ?? [];
  const taskId = tasks[0]?.task_id || "";
  const logs = useMemo(() => {
    const all = (logsQuery.data?.items ?? []).map((x) => `[${x.ts}] ${x.level} ${x.message}`);
    if (!logKeyword.trim()) return all;
    return all.filter((line) => line.toLowerCase().includes(logKeyword.toLowerCase()));
  }, [logsQuery.data, logKeyword]);

  return (
    <RouteShell activeNav="Runs" title={`Run ${runId}`} subtitle="Deep-link run detail">
      <div className="mb-2">
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          onClick={() => router.push("/runs")}
        >
          Back to Runs
        </button>
      </div>
      <RunTimelineSection
        runId={runId}
        tasks={tasks}
        onOpenTask={(tid) => router.push(`/tasks/${tid}`)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-100"
          onClick={async () => {
            const t = tasks[0]?.task_id;
            if (!t) return;
            const idem = `replay-${Date.now()}`;
            const r = await replayFromTask(tenantId, projectId, runId, token, { from_task_id: t, idempotency_key: idem });
            router.push(`/runs/${r.run_id}`);
          }}
        >
          Partial replay (from first task)
        </button>
        <a
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300"
          href={`/lineage?runId=${encodeURIComponent(runId)}`}
        >
          View lineage
        </a>
      </div>
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
        onRefreshRun={() => {
          void runQuery.refetch();
          void tasksQuery.refetch();
          void logsQuery.refetch();
          void trackingQuery.refetch();
        }}
        onReplayDlq={async () => {
          await replayDlq(tenantId, projectId, runId, token);
          await runQuery.refetch();
          await tasksQuery.refetch();
          await logsQuery.refetch();
          await trackingQuery.refetch();
        }}
      />
      <RunTrackingSection tracking={trackingQuery.data ?? null} />
    </RouteShell>
  );
}
