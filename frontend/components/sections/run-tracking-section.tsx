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

  // Component hiển thị khi không có data
  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-secondary">
        <Search size={20} />
      </div>
      <p className="text-sm text-secondary font-semibold">{message}</p>
    </div>
  );

  return (
    <section className="card p-5 shadow-md transition-colors">
      <h2 className="mb-3 text-sm font-semibold text-primary">Tracking & Metadata</h2>
      
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
                  ).map((metric: any, i: number) => (
                    <div key={i} className="group flex justify-between items-center p-2 rounded-lg hover:bg-muted/50 transition-colors border-b border-default last:border-0">
                      <span className="text-secondary font-mono text-xs">{metric.key || `metric_${i}`}</span>
                      <span className="text-info font-mono text-xs font-bold bg-info/20 px-2 py-1 rounded border border-info/40">
                        {typeof metric.value === "number" ? metric.value.toFixed(4) : String(metric.value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PARAMS */}
            {activeTab === "params" && (
              <div className="rounded-lg bg-muted p-3 border border-default">
                {!tracking.params || Object.keys(tracking.params).length === 0 ? (
                  <EmptyState message="No parameters recorded." />
                ) : (
                  <pre className="text-[11px] font-mono text-success/80 leading-relaxed overflow-x-auto max-h-60">
                    {JSON.stringify(tracking.params, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* ARTIFACTS */}
            {activeTab === "artifacts" && (
              <div className="space-y-1">
                {!tracking.artifacts || tracking.artifacts.length === 0 ? (
                  <EmptyState message="No artifacts generated." />
                ) : (
                  tracking.artifacts.map((artifact, i) => (
                    <div key={i} className="group flex justify-between items-center p-2 rounded-lg hover:bg-muted/50 transition-colors border-b border-default last:border-0">
                      <span className="text-secondary font-mono text-xs truncate flex-1 mr-2">{artifact.path}</span>
                      <span className="text-info font-mono text-xs font-bold bg-info/20 px-2 py-1 rounded border border-info/40">
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