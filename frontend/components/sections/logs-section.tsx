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
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Terminal size={20} />
      </div>
      <p className="text-section font-semibold text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <section className="rounded-lg border border-obs-border bg-obs-surface p-4 transition-colors">
      <h2 className="mb-2 text-section font-semibold text-foreground">Execution output</h2>
      <p className="mb-3 text-caption text-muted-foreground">Logs, retries, and DLQ actions — observability-focused surface.</p>
      
      {/* Tabs Navigation */}
      <div className="mb-4 border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-stable relative flex items-center gap-2 px-3 py-2 text-caption font-semibold uppercase tracking-wide transition-colors ${
                  isActive ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground"
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
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)'
                }}
              />
              <Button 
                variant="secondary" 
                onClick={onToggleStreaming}
                className="action-btn-xs px-4 py-2 text-xs"
              >
                {streaming ? "Stop" : "Start"}
              </Button>
            </div>
            <div className="h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-obs-border bg-obs-log p-3 font-mono text-xs text-foreground">
              {logs.length ? logs.join("\n") : "No logs available"}
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-4">
            <div className="h-96 max-h-96 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 font-mono text-xs text-color-success">
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
            <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              <p className="mb-2">Quick actions for run management</p>
              <p className="text-xs">Use these buttons to refresh run data or replay failed messages</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
