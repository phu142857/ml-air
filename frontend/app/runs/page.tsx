"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { LogsSection } from "@/components/sections/logs-section";
import { fetchRun, fetchRunLogs, fetchRuns, fetchRunTasks, replayDlq } from "@/lib/api";
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

  return (
    <RouteShell activeNav="Runs" title="Runs" subtitle="Run history and drill-down detail">
      <RunsHistorySection rows={data?.items ?? []} onSelectRun={loadRunContext} />
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
