"use client";

import { Button } from "@/components/ui/button";
import { RunItem, TaskItem } from "@/lib/api";

type Props = {
  runId: string;
  taskId: string;
  runDetail: RunItem | null;
  tasks: TaskItem[];
  logs: string[];
  logKeyword: string;
  streaming: boolean;
  onChangeLogKeyword: (value: string) => void;
  onToggleStreaming: () => void;
  onRefreshRun: () => void;
  onReplayDlq: () => void;
};

export function LogsSection({
  runId,
  taskId,
  runDetail,
  tasks,
  logs,
  logKeyword,
  streaming,
  onChangeLogKeyword,
  onToggleStreaming,
  onRefreshRun,
  onReplayDlq
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Run Detail</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRefreshRun}>
              Refresh Run
            </Button>
            <Button variant="secondary" onClick={onReplayDlq}>
              Replay DLQ
            </Button>
          </div>
        </div>
        <pre className="h-80 overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {JSON.stringify({ runId, taskId, runDetail, tasks }, null, 2)}
        </pre>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Logs</h2>
          <div className="flex items-center gap-2">
            <input
              value={logKeyword}
              onChange={(e) => onChangeLogKeyword(e.target.value)}
              placeholder="Search logs"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
            />
            <Button variant="secondary" onClick={onToggleStreaming}>
              {streaming ? "Stop Stream" : "Start Stream"}
            </Button>
          </div>
        </div>
        <pre className="h-80 overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {(logs.length ? logs : ["No logs yet"]).join("\n")}
        </pre>
      </section>
    </div>
  );
}
