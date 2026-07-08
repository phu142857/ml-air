"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TraceOtelTrace, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { normalizeStatus, statusChipKey, STATUS_CHIP_TEXT, statusToMlopsBadge } from "@/lib/status-style";
import { formatRuntimeSeconds } from "@/lib/usage-format";
import { cn, formatDateTimeCompact } from "@/lib/utils";

const GRID_COLS = "grid grid-cols-[260px_1fr_90px_70px]";

/** Duration labels: sub-second as ms, then seconds with sensible precision, else 2 largest units like usage timeline. */
export function formatWaterfallDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) {
    if (sec >= 10) return `${Math.round(sec)}s`;
    const rounded = Math.round(sec * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}s`;
  }
  return formatRuntimeSeconds(sec);
}

function formatStartedClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return formatDateTimeCompact(iso);
  }
}

function niceGridInterval(totalMs: number): number {
  if (totalMs <= 0) return 1000;
  const targets = [5, 4, 3, 2];
  for (const count of targets) {
    const rough = totalMs / count;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / magnitude;
    let nice = magnitude;
    if (normalized <= 1) nice = magnitude;
    else if (normalized <= 2) nice = 2 * magnitude;
    else if (normalized <= 5) nice = 5 * magnitude;
    else nice = 10 * magnitude;
    if (nice >= 1) return Math.max(1, nice);
  }
  return Math.max(1, totalMs);
}

function buildGridTicks(totalMs: number): number[] {
  const interval = niceGridInterval(totalMs);
  const ticks: number[] = [];
  let t = interval;
  while (t < totalMs) {
    ticks.push(t);
    t += interval;
  }
  return ticks;
}

function stepHref(step: TraceWaterfallStep): string | null {
  if (step.kind === "run") return `/runs/${encodeURIComponent(step.id)}`;
  if (step.kind === "task") return `/tasks/${encodeURIComponent(step.id)}`;
  return null;
}

export function otelTraceToWaterfall(otel: TraceOtelTrace): TraceWaterfall {
  return {
    run_id: otel.trace_id,
    pipeline_id: otel.services.length ? otel.services.join(", ") : undefined,
    anchor_ts: otel.anchor_ts,
    total_ms: otel.total_ms,
    steps: otel.spans.map((span) => ({
      kind: "span",
      id: span.span_id,
      label: span.name,
      status: span.status,
      start_ts: span.start_ts,
      end_ts: span.end_ts,
      duration_ms: span.duration_ms,
      plugin: span.service,
      service: span.service,
      depth: span.depth,
      tree_prefix: span.tree_prefix,
      offset_ms: span.offset_ms,
      width_ms: span.width_ms,
      end_offset_ms: span.end_offset_ms,
      is_instant: span.is_instant,
    })),
  };
}

function spanIconClass(step: TraceWaterfallStep): string {
  if (step.kind === "run") return "bg-violet-500 shadow-[0_0_0_2px_rgba(139,92,246,0.25)]";
  const svc = String(step.service || step.plugin || "").toLowerCase();
  if (svc.includes("dataset")) return "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]";
  if (step.plugin || step.kind === "span") return "bg-orange-500 shadow-[0_0_0_2px_rgba(249,115,22,0.25)]";
  const label = step.label.toLowerCase();
  if (label.includes("dataset")) return "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]";
  return "bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.25)]";
}

function barToneClass(status: string, isRunning: boolean): string {
  if (isRunning) {
    return cn(
      "bg-[length:200%_100%]",
      "bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500",
      "animate-[waterfall-shimmer_2.2s_linear_infinite]",
    );
  }
  const tone = statusToMlopsBadge(status);
  switch (tone) {
    case "success":
      return "bg-[color:var(--status-success-fg)]/80";
    case "failed":
      return "bg-[color:var(--status-failed-fg)]/80";
    case "cancelled":
      return "bg-muted-foreground/55";
    default:
      return "bg-[color:var(--status-pending-fg)]/65";
  }
}

function statusLabelClass(status: string): string {
  return STATUS_CHIP_TEXT[statusChipKey(status)];
}

function treePrefix(index: number, total: number, kind: string): string {
  if (kind === "run") return "";
  if (total <= 1) return "└─";
  return index < total - 1 ? "├─" : "└─";
}

type RowModel = TraceWaterfallStep & {
  treePrefix: string;
  paddingLeft: number;
  isRun: boolean;
};

function sourceBadge(source?: string): string | null {
  if (source === "mlair") return "MLAir";
  if (source === "otel") return "OTLP";
  return null;
}

function SpanDetailPanel({ step }: { step: TraceWaterfallStep }) {
  const attrs = step.attributes && Object.keys(step.attributes).length > 0 ? step.attributes : null;
  const badge = sourceBadge(step.source);
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{step.label}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{step.id}</p>
        </div>
        {badge ? (
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium uppercase">{normalizeStatus(step.status)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-mono">{formatWaterfallDuration(step.duration_ms ?? step.width_ms)}</dd>
        </div>
        {step.service ? (
          <div>
            <dt className="text-muted-foreground">Service</dt>
            <dd className="font-mono">{step.service}</dd>
          </div>
        ) : null}
        {step.run_id ? (
          <div>
            <dt className="text-muted-foreground">Run</dt>
            <dd>
              <Link href={`/runs/${encodeURIComponent(step.run_id)}`} className="link-primary font-mono">
                {step.run_id.slice(0, 12)}…
              </Link>
            </dd>
          </div>
        ) : null}
        {step.task_id ? (
          <div>
            <dt className="text-muted-foreground">Task</dt>
            <dd>
              <Link href={`/tasks/${encodeURIComponent(step.task_id)}`} className="link-primary font-mono">
                {String(step.task_id).slice(0, 12)}…
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
      {attrs ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[10px] text-foreground">
          {JSON.stringify(attrs, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function WaterfallSummaryCard({
  waterfall,
  variant = "run",
}: {
  waterfall: TraceWaterfall;
  variant?: "run" | "otel" | "unified";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {variant === "otel" ? (
          waterfall.pipeline_id ? (
            <div className="flex min-w-0 gap-2 sm:col-span-2">
              <dt className="shrink-0 text-muted-foreground">Services</dt>
              <dd className="truncate font-mono text-foreground">{waterfall.pipeline_id}</dd>
            </div>
          ) : null
        ) : waterfall.pipeline_id ? (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-muted-foreground">Pipeline</dt>
            <dd className="truncate font-mono text-foreground">{waterfall.pipeline_id}</dd>
          </div>
        ) : null}
        {variant === "unified" ? (
          <div className="flex min-w-0 gap-2 sm:col-span-2">
            <dt className="shrink-0 text-muted-foreground">Layers</dt>
            <dd className="font-mono text-foreground">
              {waterfall.mlair_count ?? 0} MLAir · {waterfall.otel_count ?? 0} OTLP
            </dd>
          </div>
        ) : null}
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-muted-foreground">
            {variant === "otel" ? "Trace" : variant === "unified" ? "Trace" : "Run"}
          </dt>
          <dd className="min-w-0 truncate font-mono text-foreground">{waterfall.run_id.slice(0, 12)}…</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">Started</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatStartedClock(waterfall.anchor_ts)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">Duration</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatWaterfallDuration(waterfall.total_ms)}</dd>
        </div>
      </dl>
    </div>
  );
}

function TimelineGridOverlay({ ticks, scaleMs }: { ticks: number[]; scaleMs: number }) {
  return (
    <div className="relative h-full min-h-[1px]">
      {ticks.map((tick) => (
        <div
          key={tick}
          className="absolute top-0 bottom-0 w-px bg-border/50"
          style={{ left: `${(tick / scaleMs) * 100}%` }}
        />
      ))}
    </div>
  );
}

function WaterfallBar({
  step,
  scaleMs,
  selected,
  onSelect,
}: {
  step: TraceWaterfallStep;
  scaleMs: number;
  selected?: boolean;
  onSelect?: (step: TraceWaterfallStep) => void;
}) {
  const leftPct = (step.offset_ms / scaleMs) * 100;
  const widthPct = step.is_instant ? 0 : Math.max((step.width_ms / scaleMs) * 100, 0.35);
  const isRunning = statusToMlopsBadge(step.status) === "running";
  const fill = barToneClass(step.status, isRunning);
  const duration = step.is_instant ? null : (step.duration_ms ?? (step.width_ms > 0 ? step.width_ms : null));
  const showInlineDuration = !step.is_instant && widthPct > 8 && duration != null;

  return (
    <div
      className="relative h-9 overflow-hidden rounded-lg border border-border/50 bg-muted/20"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to right, transparent 0px, transparent 79px, rgba(120,120,120,.12) 80px)",
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "absolute top-1/2 -translate-y-1/2",
              "h-5 rounded-full shadow-sm ring-1 ring-black/5 dark:ring-white/10",
              "transition-all duration-200",
              "hover:z-20 hover:scale-y-110 hover:shadow-xl hover:brightness-110",
              step.is_instant ? "w-1 -translate-x-1/2 p-0" : "min-w-[4px]",
              selected && "ring-2 ring-primary",
              fill,
            )}
            onClick={() => onSelect?.(step)}
            style={
              step.is_instant
                ? { left: `${leftPct}%` }
                : { left: `${leftPct}%`, width: `${widthPct}%` }
            }
            aria-label={`${step.label} ${formatWaterfallDuration(duration)}`}
          >
            {showInlineDuration ? (
              <span className="absolute inset-0 flex items-center justify-center px-1 text-[10px] font-medium text-white drop-shadow-sm">
                {formatWaterfallDuration(duration)}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1 text-left">
          <p className="font-medium">{step.label}</p>
          <p className="font-mono text-[10px] opacity-90">{step.id}</p>
          <p>
            {formatDateTimeCompact(step.start_ts)}
            {step.end_ts && step.end_ts !== step.start_ts ? ` → ${formatDateTimeCompact(step.end_ts)}` : ""}
          </p>
          <p>
            {step.is_instant ? "Queued" : `Duration ${formatWaterfallDuration(duration)}`}
            {" · "}
            +{formatWaterfallDuration(step.offset_ms)} from start
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function WaterfallRow({
  step,
  scaleMs,
  selected,
  onSelect,
}: {
  step: RowModel;
  scaleMs: number;
  selected?: boolean;
  onSelect?: (step: TraceWaterfallStep) => void;
}) {
  const href = stepHref(step);
  const duration = step.is_instant ? null : (step.duration_ms ?? (step.width_ms > 0 ? step.width_ms : null));
  const statusText = normalizeStatus(step.status);

  return (
    <div
      className={cn(
        GRID_COLS,
        "group cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/30",
        step.isRun && "border-l-2 border-l-primary/30 bg-primary/5 hover:bg-primary/[0.08]",
        selected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
      )}
      onClick={() => onSelect?.(step)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(step);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="min-w-0" style={{ paddingLeft: step.paddingLeft }}>
        <div className="flex min-w-0 items-center gap-2">
          {step.treePrefix ? (
            <span className="shrink-0 font-mono text-[11px] leading-none text-muted-foreground/80">
              {step.treePrefix}
            </span>
          ) : null}
          <span className={cn("h-2 w-2 shrink-0 rounded-full", spanIconClass(step))} aria-hidden />
          {sourceBadge(step.source) ? (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
              {sourceBadge(step.source)}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {href ? (
              <Link href={href} className="link-primary block truncate text-sm font-medium">
                {step.label}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-foreground">{step.label}</p>
            )}
            {!step.isRun && step.kind !== "span" ? (
              <p className="truncate font-mono text-[10px] text-muted-foreground">{step.id}</p>
            ) : step.kind === "span" && step.service ? (
              <p className="truncate text-[10px] text-muted-foreground">{step.service}</p>
            ) : null}
          </div>
        </div>
      </div>

      <WaterfallBar step={step} scaleMs={scaleMs} selected={selected} onSelect={onSelect} />

      <div className="text-right font-mono text-[11px] tabular-nums text-foreground">
        {step.is_instant ? <span className="text-muted-foreground">queued</span> : formatWaterfallDuration(duration)}
      </div>

      <div className={cn("text-right text-[10px] font-semibold uppercase tracking-wide", statusLabelClass(step.status))}>
        {statusText}
      </div>
    </div>
  );
}

export function TraceWaterfallView({
  waterfall,
  variant = "run",
  selectedStepId = null,
  onStepSelect,
}: {
  waterfall: TraceWaterfall;
  variant?: "run" | "otel" | "unified";
  selectedStepId?: string | null;
  onStepSelect?: (step: TraceWaterfallStep) => void;
}) {
  const scaleMs = Math.max(waterfall.total_ms, 1);
  const gridTicks = useMemo(() => buildGridTicks(scaleMs), [scaleMs]);

  const rows = useMemo<RowModel[]>(() => {
    const unifiedMode = variant === "unified";
    const otelMode = variant === "otel" || waterfall.steps.some((s) => s.kind === "span");
    if (unifiedMode || otelMode) {
      return waterfall.steps.map((step) => ({
        ...step,
        treePrefix: step.tree_prefix || "",
        paddingLeft: 8 + (step.depth ?? 0) * 20,
        isRun: (step.depth ?? 0) === 0 && step.kind === "run",
      }));
    }

    const runStep = waterfall.steps.find((s) => s.kind === "run");
    const taskSteps = waterfall.steps.filter((s) => s.kind === "task");
    const out: RowModel[] = [];

    if (runStep) {
      out.push({
        ...runStep,
        treePrefix: "",
        paddingLeft: 8,
        isRun: true,
      });
    }

    taskSteps.forEach((step, index) => {
      out.push({
        ...step,
        treePrefix: treePrefix(index, taskSteps.length, step.kind),
        paddingLeft: 28,
        isRun: false,
      });
    });

    return out;
  }, [variant, waterfall.steps]);

  const selectedStep = useMemo(
    () => waterfall.steps.find((s) => s.id === selectedStepId) ?? null,
    [selectedStepId, waterfall.steps],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <style>{`
        @keyframes waterfall-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="space-y-3">
        <WaterfallSummaryCard waterfall={waterfall} variant={variant} />

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div
            className={cn(
              GRID_COLS,
              "border-b border-border/80 px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
            )}
          >
            <span>Span</span>
            <span>Timeline</span>
            <span className="text-right">Duration</span>
            <span className="text-right">Status</span>
          </div>

          <div className="relative divide-y divide-border/70">
            <div className={cn(GRID_COLS, "pointer-events-none absolute inset-0 px-3")}>
              <div />
              <TimelineGridOverlay ticks={gridTicks} scaleMs={scaleMs} />
              <div />
              <div />
            </div>

            {rows.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">No spans recorded for this trace.</p>
            ) : (
              rows.map((step) => (
                <WaterfallRow
                  key={`${step.source || "x"}-${step.id}`}
                  step={step}
                  scaleMs={scaleMs}
                  selected={selectedStepId === step.id}
                  onSelect={onStepSelect}
                />
              ))
            )}
          </div>
        </div>

        {selectedStep && onStepSelect ? <SpanDetailPanel step={selectedStep} /> : null}

        {rows.length <= 1 ? (
          <p className="text-xs text-muted-foreground">No tasks recorded for this run yet.</p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
