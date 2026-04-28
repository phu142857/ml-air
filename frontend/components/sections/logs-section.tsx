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
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-secondary">
        <Terminal size={20} />
      </div>
      <p className="text-sm text-secondary font-semibold">{message}</p>
    </div>
  );

  return (
    <section className="card p-5 shadow-md transition-colors">
      <h2 className="mb-3 text-sm font-semibold text-primary">Live System Output</h2>
      
      {/* Tabs Navigation */}
      <div className="mb-4 border-b border-default">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-stable flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors relative ${
                  isActive ? "text-color-primary border-color-primary" : "text-secondary hover:text-primary"
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
                className="flex-1 rounded-lg border border-default bg-surface px-3 py-2 text-xs text-primary placeholder:!text-secondary"
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
            <div className="bg-muted rounded-lg p-4 font-mono text-xs text-primary h-96 overflow-y-auto whitespace-pre-wrap">
              {logs.length ? logs.join("\n") : "No logs available"}
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 font-mono text-xs text-success h-96 overflow-y-auto whitespace-pre-wrap break-all">
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
            <div className="bg-muted rounded-lg p-4 text-center text-secondary text-sm">
              <p className="mb-2">Quick actions for run management</p>
              <p className="text-xs">Use these buttons to refresh run data or replay failed messages</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
