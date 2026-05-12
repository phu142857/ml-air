"use client";

import { useEffect, useRef, useMemo } from "react";
import type { TaskItem, RunTracking } from "@/lib/api";

type Props = {
  tasks: TaskItem[];
  runId: string;
  tracking?: RunTracking | null;
  onOpenTask: (taskId: string) => void;
};

function parseTs(s: string | null | undefined): number {
  if (!s) return Date.now();
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() : t;
}

const PHASE_LABELS: Record<string, string> = {
  initializing: "Initializing",
  data_collection: "Data Collection",
  preprocessing: "Preprocessing",
  model_fit: "Model Fitting",
  calibration: "Calibration",
  cv_scoring: "Cross-Validation",
  regression_gate: "Regression Gate",
  feedback_gate: "Feedback Gate",
  model_save: "Saving Model",
  mlair_sync: "MLAir Sync",
  done: "Completed",
};

export function RunTimelineSection({ tasks, tracking, onOpenTask }: Props) {
  const failRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failRef.current) {
      failRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [tasks]);

  const trainingProgress = useMemo(() => {
    if (!tracking) return null;
    const pctMetrics = (tracking.metrics ?? [])
      .filter((m) => m.key === "progress_pct")
      .sort((a, b) => a.step - b.step);
    const latestPct = pctMetrics.length > 0 ? pctMetrics[pctMetrics.length - 1].value : null;
    const phaseParams = (tracking.params ?? []).filter((p) => p.key === "current_phase");
    const latestPhase = phaseParams.length > 0 ? phaseParams[phaseParams.length - 1].value : null;
    if (latestPct === null) return null;
    return {
      pct: Math.min(100, Math.max(0, Math.round(latestPct))),
      phase: latestPhase,
      phaseLabel: latestPhase ? (PHASE_LABELS[latestPhase] ?? latestPhase) : null,
    };
  }, [tracking]);

  // Keep QUEUED distinct from PENDING in external-execution mode.
  const getStatus = (task: any): "success" | "error" | "running" | "queued" | "pending" => {
    if (task.error_message && task.error_message.length > 0) return "error";
    if (task.status === "FAILED") return "error";
    if (task.status === "SUCCESS") return "success";
    if (task.status === "QUEUED") return "queued";
    if (task.status === "RUNNING") return "running";
    return "pending";
  };

  if (!tasks.length) {
    return (
      <div className="rounded-lg border border-obs-border bg-obs-surface p-4 text-body text-muted-foreground">
        No tasks yet
      </div>
    );
  }

  const t0 = Math.min(...tasks.map((t) => parseTs(t.started_at || t.created_at)));
  const t1 = Math.max(...tasks.map((t) => parseTs(t.finished_at || t.updated_at || t.started_at || t.created_at)));
  const span = Math.max(1, t1 - t0);

  return (
    <div className="rounded-lg border border-obs-border bg-obs-surface p-4">
      <div className="space-y-3">
        {tasks.map((t, i) => {
          const a = parseTs(t.started_at || t.created_at);
          const b = parseTs(t.finished_at || t.updated_at || t.started_at || t.created_at);
          const left = ((a - t0) / span) * 100;
          const width = Math.max(2, Math.max(0, ((b - a) / span) * 100));
          const taskStatus = getStatus(t);
          const isFail = taskStatus === "error";
          const isLastFailed =
            isFail &&
            !tasks
              .slice(i + 1)
              .some((u) => getStatus(u) === "error");
          return (
            <div
              key={t.task_id + t.attempt}
              ref={isLastFailed ? failRef : undefined}
              className={`rounded-xl border border-border p-3 transition ${
                taskStatus === "error" ? "border-color-error bg-bg-error" :
                taskStatus === "success" ? "border-color-success bg-bg-success" :
                taskStatus === "running" ? "border-color-info bg-bg-info" :
                taskStatus === "queued" ? "border border-amber-500/30 bg-amber-500/10" :
                "border-border bg-muted"
              }`}
            >
              {/* Task Header */}
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => onOpenTask(t.task_id)}
                  className="font-mono text-caption text-foreground hover:text-color-primary hover:underline"
                >
                  {t.task_id} · attempt {t.attempt}
                </button>
                <span
                  className={`text-overline font-semibold px-2 py-0.5 rounded-full ${
                    taskStatus === "error" && "bg-bg-error text-color-error"
                  }${
                    taskStatus === "success" && " bg-bg-success text-color-success"
                  }${
                    taskStatus === "running" && " bg-bg-info text-color-info"
                  }${
                    taskStatus === "queued" && " bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {taskStatus}
                </span>
              </div>

              {/* Training Progress Bar */}
              {trainingProgress && trainingProgress.pct > 0 ? (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-overline font-semibold text-muted-foreground uppercase tracking-wider">
                      {trainingProgress.phaseLabel ?? "Training"}
                    </span>
                    <span className={`font-mono text-xs font-bold ${
                      trainingProgress.pct >= 100 ? "text-color-success" : "text-color-info"
                    }`}>
                      {trainingProgress.pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        taskStatus === "error" ? "bg-color-error" :
                        trainingProgress.pct >= 100 ? "bg-color-success" :
                        "bg-color-info"
                      }`}
                      style={{ width: `${trainingProgress.pct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full ${
                      taskStatus === "error" ? "bg-color-error" :
                      taskStatus === "success" ? "bg-color-success" :
                      taskStatus === "queued" ? "bg-amber-400" :
                      "bg-color-info"
                    }`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              )}

              {/* Meta Info */}
              <div className="flex gap-4 text-caption text-muted-foreground">
                <span>wall: {t.duration_ms ?? "-"}ms</span>
                <span>cpu: {t.cpu_time_seconds?.toFixed(4) ?? "-"}s</span>
                <span>rss: {t.memory_rss_kb ?? "-"}KB</span>
              </div>

              {/* Error Message */}
              {t.error_message && (
                <div className="mt-2 rounded-md bg-bg-error border border-color-error px-2 py-1 text-caption font-semibold text-color-error">
                  {t.error_message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
