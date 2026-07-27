import type {
  TraceDetailResponse,
  TraceDetailRun,
  TraceSearchHit,
  TraceWaterfall,
  TraceWaterfallStep,
} from "@/lib/api";
import { computeRunWallDurationSeconds } from "@/lib/run-duration";
import { computeTaskElapsedSeconds } from "@/lib/task-elapsed";
import { isActiveExecutionStatus } from "@/lib/status-style";
import { parseTsMs, wallDurationMs } from "@/lib/time-parse";

export type TraceDurationContext = {
  nowMs: number;
  isLive: boolean;
  runsById: Map<string, TraceDetailRun>;
  tasksByRunId: Map<string, Map<string, TraceWaterfallTaskSlice>>;
  primaryRunId: string | null;
};

export type TraceWaterfallTaskSlice = {
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
};

function collectTasksFromWaterfall(
  waterfall: TraceWaterfall | null | undefined,
  into: Map<string, TraceWaterfallTaskSlice>,
) {
  if (!waterfall) return;
  for (const step of waterfall.steps) {
    if (step.kind !== "task" || !step.id) continue;
    into.set(step.id, {
      status: step.status,
      started_at: step.start_ts,
      finished_at: step.end_ts,
      duration_ms: step.duration_ms,
    });
  }
}

export function buildTraceDurationContext(
  detail: TraceDetailResponse | null | undefined,
  nowMs: number = Date.now(),
): TraceDurationContext {
  const runsById = new Map<string, TraceDetailRun>();
  for (const run of detail?.runs ?? []) {
    if (run.run_id) runsById.set(run.run_id, run);
  }

  const tasksByRunId = new Map<string, Map<string, TraceWaterfallTaskSlice>>();
  const registerWaterfall = (waterfall: TraceWaterfall | null | undefined) => {
    if (!waterfall?.run_id) return;
    const bucket = tasksByRunId.get(waterfall.run_id) ?? new Map<string, TraceWaterfallTaskSlice>();
    collectTasksFromWaterfall(waterfall, bucket);
    tasksByRunId.set(waterfall.run_id, bucket);
  };

  registerWaterfall(detail?.waterfall);
  registerWaterfall(detail?.unified_waterfall);

  return {
    nowMs,
    isLive: Boolean(detail?.is_live),
    runsById,
    tasksByRunId,
    primaryRunId: detail?.primary_run_id ?? detail?.waterfall?.run_id ?? null,
  };
}

function tasksForRun(ctx: TraceDurationContext, runId: string | null | undefined): TraceWaterfallTaskSlice[] {
  if (!runId) return [];
  const bucket = ctx.tasksByRunId.get(runId);
  return bucket ? [...bucket.values()] : [];
}

function stepWallMs(
  step: Pick<TraceWaterfallStep, "status" | "start_ts" | "end_ts" | "duration_ms" | "width_ms">,
  ctx: TraceDurationContext,
): number | null {
  const liveEnd = ctx.isLive && isActiveExecutionStatus(step.status);
  const wall = wallDurationMs(step.start_ts, step.end_ts, ctx.nowMs, liveEnd);
  if (wall != null) return wall;
  if (step.duration_ms != null && step.duration_ms >= 0) return step.duration_ms;
  if (step.width_ms != null && step.width_ms > 0) return step.width_ms;
  return null;
}

export function computeWaterfallStepDurationMs(
  step: TraceWaterfallStep,
  ctx: TraceDurationContext,
): number | null {
  if (step.is_instant) return null;

  if (step.kind === "run") {
    const runId = step.id || ctx.primaryRunId;
    const run = runId ? ctx.runsById.get(runId) : undefined;
    if (run) {
      const tasks = tasksForRun(ctx, runId);
      const seconds = computeRunWallDurationSeconds(
        {
          created_at: run.created_at ?? undefined,
          updated_at: run.updated_at ?? undefined,
          status: run.status,
        },
        tasks.map((task) => ({
          status: task.status,
          finished_at: task.finished_at,
        })),
        ctx.nowMs,
      );
      if (seconds != null) return Math.round(seconds * 1000);
    }
    return stepWallMs(step, ctx);
  }

  if (step.kind === "task") {
    const seconds = computeTaskElapsedSeconds(
      {
        status: step.status,
        started_at: step.start_ts,
        finished_at: step.end_ts,
        duration_ms: step.duration_ms,
      },
      ctx.nowMs,
    );
    if (seconds != null) return Math.round(seconds * 1000);
    return stepWallMs(step, ctx);
  }

  return stepWallMs(step, ctx);
}

export function computeTraceSearchDurationMs(
  hit: Pick<TraceSearchHit, "start_ts" | "last_seen" | "duration_ms">,
  opts?: { nowMs?: number; isLive?: boolean },
): number | null {
  const nowMs = opts?.nowMs ?? Date.now();
  const startMs = parseTsMs(hit.start_ts);
  if (startMs != null) {
    if (opts?.isLive) return Math.max(0, nowMs - startMs);
    const endMs = parseTsMs(hit.last_seen);
    if (endMs != null) return Math.max(0, endMs - startMs);
  }
  return hit.duration_ms ?? null;
}
