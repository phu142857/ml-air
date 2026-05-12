"use client";

import { useState } from "react";
import { RunTracking } from "@/lib/api";
import { BarChart3, Settings, Package, GitBranch, Search } from "lucide-react";

type Props = {
  tracking: RunTracking | null;
};

type TabType = "metrics" | "params" | "artifacts";

export function RunTrackingSection({ tracking }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("metrics");

  const tabs = [
    { id: "metrics" as TabType, label: "Metrics", icon: BarChart3 },
    { id: "params" as TabType, label: "Params", icon: Settings },
    { id: "artifacts" as TabType, label: "Artifacts", icon: Package },
  ];

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search size={20} />
      </div>
      <p className="text-section font-semibold text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <section className="rounded-lg border border-obs-border bg-obs-surface p-4 transition-colors">
      <h2 className="mb-3 text-section font-semibold text-foreground">Tracking & Metadata</h2>
      
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
        {!tracking ? (
          <EmptyState message="No tracking context available for this run." />
        ) : (
          <>
            {/* METRICS */}
            {activeTab === "metrics" && (
              <div className="space-y-1">
                {(!tracking.metrics || (Array.isArray(tracking.metrics) && tracking.metrics.length === 0)) ? (
                  <EmptyState message="No metrics logged yet." />
                ) : (
                  (Array.isArray(tracking.metrics) 
                    ? tracking.metrics 
                    : Object.entries(tracking.metrics).map(([key, value]) => ({ key, value }))
                  ).filter((metric: any) => metric.key !== "progress_pct"
                  ).map((metric: any, i: number) => (
                    <div
                      key={i}
                      className="group flex items-center justify-between border-b border-border p-2 transition-colors last:border-0 hover:bg-muted/50 rounded-lg"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{metric.key || `metric_${i}`}</span>
                      <span className="rounded border border-color-info/40 bg-color-info/15 px-2 py-1 font-mono text-xs font-bold text-color-info">
                        {typeof metric.value === "number" ? metric.value.toFixed(4) : String(metric.value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PARAMS */}
            {activeTab === "params" && (() => {
              const filtered = Array.isArray(tracking.params)
                ? tracking.params.filter((p: any) => p.key !== "current_phase")
                : tracking.params;
              return (
                <div className="rounded-lg border border-border bg-muted p-3">
                  {!filtered || (Array.isArray(filtered) && filtered.length === 0) || Object.keys(filtered).length === 0 ? (
                    <EmptyState message="No parameters recorded." />
                  ) : (
                    <pre className="max-h-60 overflow-x-auto font-mono text-caption leading-relaxed text-color-success">
                      {JSON.stringify(filtered, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })()}

            {/* ARTIFACTS */}
            {activeTab === "artifacts" && (
              <div className="space-y-1">
                {!tracking.artifacts || tracking.artifacts.length === 0 ? (
                  <EmptyState message="No artifacts generated." />
                ) : (
                  tracking.artifacts.map((artifact, i) => (
                    <div
                      key={i}
                      className="group flex items-center justify-between border-b border-border p-2 transition-colors last:border-0 hover:bg-muted/50 rounded-lg"
                    >
                      <span className="mr-2 flex-1 truncate font-mono text-xs text-muted-foreground">{artifact.path}</span>
                      <span className="rounded border border-color-info/40 bg-color-info/15 px-2 py-1 font-mono text-xs font-bold text-color-info">
                        {artifact.uri ? (
                          <a href={artifact.uri} target="_blank" rel="noreferrer" className="hover:underline">
                            VIEW
                          </a>
                        ) : (
                          "NO LINK"
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}