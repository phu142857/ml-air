"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RunItem, TaskItem } from "@/lib/api";
import { Terminal, FileText, Settings, RotateCcw } from "lucide-react";

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

type TabType = "logs" | "details" | "actions";

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
  const [activeTab, setActiveTab] = useState<TabType>("logs");

  const tabs = [
    { id: "logs" as TabType, label: "Logs", icon: Terminal },
    { id: "details" as TabType, label: "Details", icon: FileText },
    { id: "actions" as TabType, label: "Actions", icon: Settings },
  ];

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
        <Terminal size={20} />
      </div>
      <p className="text-sm font-semibold text-zinc-500">{message}</p>
    </div>
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors">
      <h2 className="mb-2 text-sm font-semibold text-zinc-100">Execution output</h2>
      <p className="mb-3 text-xs text-zinc-500">Logs, retries, and DLQ actions — observability-focused surface.</p>
      
      {/* Tabs Navigation */}
      <div className="mb-4 border-b border-zinc-800">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-stable relative flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "border-b-2 border-sky-500 text-sky-400"
                    : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 min-h-[200px]">
        {activeTab === "logs" && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <input
                value={logKeyword}
                onChange={(e) => onChangeLogKeyword(e.target.value)}
                placeholder="Search logs..."
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500"
              />
              <Button 
                variant="secondary" 
                onClick={onToggleStreaming}
                className="action-btn-xs px-4 py-2 text-xs"
              >
                {streaming ? "Stop" : "Start"}
              </Button>
            </div>
            <div className="h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-xs text-zinc-100">
              {logs.length ? logs.join("\n") : "No logs available"}
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-4">
            <div className="h-96 max-h-96 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-400">
              {JSON.stringify({ runId, taskId, runDetail, tasks }, null, 2)}
            </div>
          </div>
        )}

        {activeTab === "actions" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={onRefreshRun}
                className="flex items-center gap-2 justify-center py-3"
              >
                <RotateCcw size={16} />
                Refresh Run
              </Button>
              <Button 
                onClick={onReplayDlq}
                className="flex items-center gap-2 justify-center py-3"
              >
                <RotateCcw size={16} />
                Replay DLQ
              </Button>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-center text-sm text-zinc-500">
              <p className="mb-2">Quick actions for run management</p>
              <p className="text-xs">Use these buttons to refresh run data or replay failed messages</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
