"use client";

import { useState, useMemo } from "react";
import { RunTracking } from "@/lib/api";
import { BarChart3, Settings, Package, Search } from "lucide-react";

type Props = {
  tracking: RunTracking | null;
};

type TabType = "metrics" | "params" | "artifacts";

// Runtime progress keys — hidden from metrics tab (shown in task progress bars)
const PROGRESS_KEY_RE = /^(.+_)?progress_pct$/;
const PHASE_KEY_RE = /^(.+_)?phase$/;

// Internal / debug metric keys to always hide
const HIDDEN_METRIC_KEYS = new Set([
  "progress_pct",
  "current_phase",
  "split_random_state",
]);

// Internal / debug param keys to always hide
const HIDDEN_PARAM_KEYS = new Set([
  "current_phase",
  "source",
  "phase",
]);
const HIDDEN_PARAM_PREFIXES = ["vetai_model_params_json"];

// Deduplicate metrics: keep only the latest (highest step) per key
function deduplicateMetrics(
  metrics: Array<{ key: string; value: number; step: number }>,
): Array<{ key: string; value: number; step: number }> {
  const best = new Map<string, { key: string; value: number; step: number }>();
  for (const m of metrics) {
    const prev = best.get(m.key);
    if (!prev || m.step > prev.step) {
      best.set(m.key, m);
    }
  }
  return Array.from(best.values());
}

function isHiddenMetric(key: string): boolean {
  if (HIDDEN_METRIC_KEYS.has(key)) return true;
  if (PROGRESS_KEY_RE.test(key)) return true;
  if (PHASE_KEY_RE.test(key)) return true;
  return false;
}

function isHiddenParam(key: string): boolean {
  if (HIDDEN_PARAM_KEYS.has(key)) return true;
  if (PHASE_KEY_RE.test(key)) return true;
  if (PROGRESS_KEY_RE.test(key)) return true;
  for (const prefix of HIDDEN_PARAM_PREFIXES) {
    if (key === prefix) return true;
  }
  return false;
}

// Friendly display names for common metric/param keys
const LABEL_MAP: Record<string, string> = {
  training_accuracy: "Training Accuracy",
  validation_accuracy: "Validation Accuracy",
  validation_f1: "Validation F1",
  cv_mean_accuracy: "CV Mean Accuracy",
  cv_std_accuracy: "CV Std Accuracy",
  cv_mean_f1_weighted: "CV Mean F1 (weighted)",
  cv_std_f1_weighted: "CV Std F1 (weighted)",
  f1_score: "F1 Score",
  training_time_seconds: "Training Time (s)",
  n_samples: "Samples",
  n_features: "Features",
  n_classes: "Classes",
  test_split_ratio: "Test Split Ratio",
  cv_folds: "CV Folds",
  cv_repeats: "CV Repeats",
  calibration_brier_before: "Brier (before cal.)",
  calibration_brier_after: "Brier (after cal.)",
  calibration_samples: "Calibration Samples",
  confidence_threshold_f1: "Confidence Threshold",
  confidence_threshold_f1_score: "Threshold F1 Score",
  golden_base_accuracy: "Golden Base Accuracy",
  golden_new_accuracy: "Golden New Accuracy",
  golden_base_f1_weighted: "Golden Base F1",
  golden_new_f1_weighted: "Golden New F1",
  feedback_base_score: "Feedback Base Score",
  feedback_new_score: "Feedback New Score",
  feedback_eval_size: "Feedback Eval Size",
  golden_test_size: "Golden Test Size",
  regression_effective_tolerance_f1: "Regression Tolerance F1",
  vetai_training_id: "Training ID",
  vetai_cv_strategy: "CV Strategy",
  vetai_validation_mode_used: "Validation Mode",
  vetai_validation_note: "Validation Note",
  vetai_calibration_method: "Calibration Method",
  vetai_feedback_gate_metric: "Feedback Gate Metric",
  vetai_training_scope: "Training Scope",
  vetai_model_version: "Model Version",
  vetai_training_mode: "Training Mode",
  vetai_pipeline_kind: "Pipeline Kind",
  vetai_finetune_base_dir: "Finetune Base Dir",
};

function friendlyLabel(key: string): string {
  return LABEL_MAP[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
      <Search size={20} />
    </div>
    <p className="text-sm font-semibold text-zinc-500">{message}</p>
  </div>
);

export function RunTrackingSection({ tracking }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("metrics");

  const tabs = [
    { id: "metrics" as TabType, label: "Metrics", icon: BarChart3 },
    { id: "params" as TabType, label: "Params", icon: Settings },
    { id: "artifacts" as TabType, label: "Artifacts", icon: Package },
  ];

  // Filtered & deduplicated metrics
  const visibleMetrics = useMemo(() => {
    if (!tracking?.metrics) return [];
    const raw = Array.isArray(tracking.metrics)
      ? tracking.metrics
      : Object.entries(tracking.metrics).map(([key, value]) => ({ key, value: value as number, step: 0 }));
    const filtered = raw.filter((m) => !isHiddenMetric(m.key));
    return deduplicateMetrics(filtered);
  }, [tracking]);

  // Filtered & deduplicated params
  const visibleParams = useMemo(() => {
    if (!tracking?.params || !Array.isArray(tracking.params)) return [];
    const seen = new Map<string, { key: string; value: string }>();
    for (const p of tracking.params) {
      if (isHiddenParam(p.key)) continue;
      seen.set(p.key, p);
    }
    return Array.from(seen.values());
  }, [tracking]);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Tracking & Metadata</h2>
      
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
                  isActive ? "border-b-2 border-sky-500 text-sky-400" : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-200"
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
                {visibleMetrics.length === 0 ? (
                  <EmptyState message="No metrics logged yet." />
                ) : (
                  visibleMetrics.map((metric, i) => (
                    <div
                      key={metric.key}
                      className="group flex items-center justify-between border-b border-zinc-800 p-2 transition-colors last:border-0 hover:bg-zinc-900/50 rounded-lg"
                    >
                      <span className="font-mono text-xs text-zinc-500">{friendlyLabel(metric.key)}</span>
                      <span className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1 font-mono text-xs font-bold text-sky-300">
                        {typeof metric.value === "number" ? metric.value.toFixed(4) : String(metric.value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PARAMS */}
            {activeTab === "params" && (
              <div className="space-y-1">
                {visibleParams.length === 0 ? (
                  <EmptyState message="No parameters recorded." />
                ) : (
                  visibleParams.map((param) => (
                    <div
                      key={param.key}
                      className="group flex items-center justify-between border-b border-zinc-800 p-2 transition-colors last:border-0 hover:bg-zinc-900/50 rounded-lg"
                    >
                      <span className="font-mono text-xs text-zinc-500">{friendlyLabel(param.key)}</span>
                      <span className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-xs text-zinc-100 max-w-[60%] truncate" title={String(param.value)}>
                        {String(param.value)}
                      </span>
                    </div>
                  ))
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
                    <div
                      key={i}
                      className="group flex items-center justify-between border-b border-zinc-800 p-2 transition-colors last:border-0 hover:bg-zinc-900/50 rounded-lg"
                    >
                      <span className="mr-2 flex-1 truncate font-mono text-xs text-zinc-500">{artifact.path}</span>
                      <span className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1 font-mono text-xs font-bold text-sky-300">
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