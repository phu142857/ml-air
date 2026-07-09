"use client";

import Link from "next/link";
import { ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/mlops/status-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TraceOtelTrace, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { statusToMlopsBadge } from "@/lib/status-style";
import { formatRuntimeSeconds } from "@/lib/usage-format";
import { cn, formatDateTimeCompact } from "@/lib/utils";

const LABEL_COL = "minmax(200px, 280px)";
const GRID_TEMPLATE = `${LABEL_COL} minmax(0, 1fr) 72px 80px`;

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
      attributes: span.attributes,
      span_id: span.span_id,
    })),
  };
}

function barToneClass(status: string, isRunning: boolean): string {
  if (isRunning) return "bg-[color:var(--status-running-fg)]";
  const tone = statusToMlopsBadge(status);
  switch (tone) {
    case "success":
      return "bg-[color:var(--status-success-fg)]";
    case "failed":
      return "bg-[color:var(--status-failed-fg)]";
    case "cancelled":
      return "bg-muted-foreground/60";
    default:
      return "bg-[color:var(--status-pending-fg)]";
  }
}

function stepHref(step: TraceWaterfallStep): string | null {
  if (step.kind === "run") return `/runs/${encodeURIComponent(step.id)}`;
  if (step.kind === "task") return `/tasks/${encodeURIComponent(step.id)}`;
  return null;
}

type RowModel = TraceWaterfallStep & {
  treePrefix: string;
  paddingLeft: number;
  isRun: boolean;
  flatIndex: number;
};

type SectionModel = {
  id: string;
  title: string;
  count: number;
  rows: RowModel[];
};

function WaterfallBar({
  step,
  scaleMs,
  zoomMin,
  isSelected,
  isHovered,
  isFocused,
  onZoomMouseDown,
  onZoomMouseMove,
  onZoomMouseUp,
  refAreaLeft,
  refAreaRight,
}: {
  step: TraceWaterfallStep;
  scaleMs: number;
  zoomMin: number;
  isSelected?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  onZoomMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseUp?: () => void;
  refAreaLeft?: number | null;
  refAreaRight?: number | null;
}) {
  const leftPct = ((step.offset_ms - zoomMin) / scaleMs) * 100;
  const widthPct = step.is_instant ? 0 : Math.max((step.width_ms / scaleMs) * 100, 0.4);
  const isRunning = statusToMlopsBadge(step.status) === "running";
  const fill = barToneClass(step.status, isRunning);

  return (
    <div
      className="relative h-8 cursor-crosshair overflow-hidden rounded-md border border-border bg-muted/20"
      onMouseDown={onZoomMouseDown}
      onMouseMove={onZoomMouseMove}
      onMouseUp={onZoomMouseUp}
      onMouseLeave={onZoomMouseUp}
    >
      {refAreaLeft != null && refAreaRight != null ? (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-0 rounded bg-primary/10 ring-1 ring-primary/30"
          style={{
            left: `${((Math.min(refAreaLeft, refAreaRight) - zoomMin) / scaleMs) * 100}%`,
            width: `${(Math.abs(refAreaRight - refAreaLeft) / scaleMs) * 100}%`,
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-sm transition-default",
          step.is_instant ? "h-4 w-0.5 -translate-x-1/2" : "h-4 min-w-[3px]",
          fill,
          isHovered && "ring-2 ring-foreground/20",
          isSelected && "ring-2 ring-primary",
          isFocused && !isSelected && "ring-2 ring-ring/50",
        )}
        style={
          step.is_instant
            ? { left: `${leftPct}%` }
            : { left: `${leftPct}%`, width: `${widthPct}%` }
        }
      />
    </div>
  );
}

function WaterfallRow({
  step,
  scaleMs,
  zoomMin,
  isSelected,
  isHovered,
  isFocused,
  onSelect,
  onHover,
  onZoomMouseDown,
  onZoomMouseMove,
  onZoomMouseUp,
  refAreaLeft,
  refAreaRight,
}: {
  step: RowModel;
  scaleMs: number;
  zoomMin: number;
  isSelected?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  onSelect?: (step: TraceWaterfallStep) => void;
  onHover?: (step: TraceWaterfallStep | null) => void;
  onZoomMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseUp?: () => void;
  refAreaLeft?: number | null;
  refAreaRight?: number | null;
}) {
  const href = stepHref(step);
  const duration = step.is_instant ? null : (step.duration_ms ?? (step.width_ms > 0 ? step.width_ms : null));
  const rowLabel = `${step.label}, ${step.is_instant ? "instant" : formatWaterfallDuration(duration)}, ${step.status}`;

  return (
    <div
      className={cn(
        "grid items-center gap-2 border-b border-border px-3 py-2 transition-default",
        isSelected && "bg-primary/8",
        isHovered && !isSelected && "bg-muted/50",
        isFocused && !isSelected && "bg-muted/40",
      )}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
      onMouseEnter={() => onHover?.(step)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onSelect?.(step)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(step);
        }
      }}
      role="row"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      aria-label={rowLabel}
      data-flat-index={step.flatIndex}
    >
      <div className="min-w-0" style={{ paddingLeft: step.paddingLeft }} role="gridcell">
        <div className="flex min-w-0 items-center gap-2">
          {step.treePrefix ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-hidden>
              {step.treePrefix}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {href ? (
              <Link
                href={href}
                className="link-primary block truncate text-sm font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {step.label}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-foreground">{step.label}</p>
            )}
            {step.service ? (
              <p className="truncate font-mono text-xs text-muted-foreground">{step.service}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div role="gridcell" className="min-w-0">
        <WaterfallBar
          step={step}
          scaleMs={scaleMs}
          zoomMin={zoomMin}
          isSelected={isSelected}
          isHovered={isHovered}
          isFocused={isFocused}
          onZoomMouseDown={onZoomMouseDown}
          onZoomMouseMove={onZoomMouseMove}
          onZoomMouseUp={onZoomMouseUp}
          refAreaLeft={refAreaLeft}
          refAreaRight={refAreaRight}
        />
      </div>

      <div className="text-right font-mono text-xs tabular-nums text-foreground" role="gridcell">
        {step.is_instant ? (
          <span className="text-muted-foreground">instant</span>
        ) : (
          formatWaterfallDuration(duration)
        )}
      </div>

      <div className="flex justify-end" role="gridcell">
        <StatusBadge value={step.status} size="sm" showIcon={false} />
      </div>
    </div>
  );
}

export type TraceWaterfallViewProps = {
  waterfall: TraceWaterfall;
  variant?: "run" | "otel" | "unified";
  selectedStepId?: string | null;
  hoveredStepId?: string | null;
  focusedFlatIndex?: number | null;
  spanFilter?: string;
  onStepSelect?: (step: TraceWaterfallStep | null) => void;
  onStepHover?: (step: TraceWaterfallStep | null) => void;
  onFlatStepsChange?: (steps: TraceWaterfallStep[]) => void;
  onZoomHandlersReady?: (handlers: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  }) => void;
};

export function TraceWaterfallView({
  waterfall,
  variant = "run",
  selectedStepId: controlledSelectedId,
  hoveredStepId: controlledHoveredId,
  focusedFlatIndex = null,
  spanFilter = "",
  onStepSelect,
  onStepHover,
  onFlatStepsChange,
  onZoomHandlersReady,
}: TraceWaterfallViewProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [internalHoveredId, setInternalHoveredId] = useState<string | null>(null);
  const selectedStepId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const hoveredStepId = controlledHoveredId !== undefined ? controlledHoveredId : internalHoveredId;

  const totalMs = Math.max(waterfall.total_ms, 1);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  const zoomMin = zoomDomain?.[0] ?? 0;
  const zoomMax = zoomDomain?.[1] ?? totalMs;
  const scaleMs = Math.max(zoomMax - zoomMin, 1);

  const msFromClientX = useCallback(
    (clientX: number, rect: DOMRect) => {
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
      return zoomMin + ratio * scaleMs;
    },
    [scaleMs, zoomMin],
  );

  const handleZoomMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setRefAreaLeft(msFromClientX(e.clientX, rect));
      setRefAreaRight(null);
    },
    [msFromClientX],
  );

  const handleZoomMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (refAreaLeft == null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setRefAreaRight(msFromClientX(e.clientX, rect));
    },
    [msFromClientX, refAreaLeft],
  );

  const handleZoomMouseUp = useCallback(() => {
    if (refAreaLeft == null || refAreaRight == null || refAreaLeft === refAreaRight) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    const left = Math.max(0, Math.min(refAreaLeft, refAreaRight));
    const right = Math.min(totalMs, Math.max(refAreaLeft, refAreaRight));
    if (right - left > scaleMs * 0.02) {
      setZoomDomain([left, right]);
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, scaleMs, totalMs]);

  const resetZoom = useCallback(() => setZoomDomain(null), []);

  const zoomIn = useCallback(() => {
    const span = zoomMax - zoomMin;
    const nextSpan = Math.max(span * 0.5, 10);
    const center = (zoomMin + zoomMax) / 2;
    setZoomDomain([
      Math.max(0, center - nextSpan / 2),
      Math.min(totalMs, center + nextSpan / 2),
    ]);
  }, [totalMs, zoomMax, zoomMin]);

  const zoomOut = useCallback(() => {
    const span = zoomMax - zoomMin;
    const nextSpan = Math.min(span * 2, totalMs);
    const center = (zoomMin + zoomMax) / 2;
    const left = Math.max(0, center - nextSpan / 2);
    const right = Math.min(totalMs, center + nextSpan / 2);
    if (right - left >= totalMs * 0.98) {
      setZoomDomain(null);
    } else {
      setZoomDomain([left, right]);
    }
  }, [totalMs, zoomMax, zoomMin]);

  const rows = useMemo<RowModel[]>(() => {
    const unifiedMode = variant === "unified";
    const otelMode = variant === "otel" || waterfall.steps.some((s) => s.kind === "span");
    const filter = spanFilter.trim().toLowerCase();

    const base =
      unifiedMode || otelMode
        ? waterfall.steps.map((step) => ({
            ...step,
            treePrefix: step.tree_prefix || "",
            paddingLeft: 8 + (step.depth ?? 0) * 16,
            isRun: (step.depth ?? 0) === 0 && step.kind === "run",
          }))
        : (() => {
            const runStep = waterfall.steps.find((s) => s.kind === "run");
            const taskSteps = waterfall.steps.filter((s) => s.kind === "task");
            const out: Omit<RowModel, "flatIndex">[] = [];
            if (runStep) {
              out.push({ ...runStep, treePrefix: "", paddingLeft: 8, isRun: true });
            }
            taskSteps.forEach((step, index) => {
              out.push({
                ...step,
                treePrefix: index < taskSteps.length - 1 ? "├─" : "└─",
                paddingLeft: 24,
                isRun: false,
              });
            });
            return out;
          })();

    const filtered = filter
      ? base.filter(
          (step) =>
            step.label.toLowerCase().includes(filter) ||
            step.id.toLowerCase().includes(filter) ||
            String(step.service || "").toLowerCase().includes(filter),
        )
      : base;

    return filtered.map((step, flatIndex) => ({ ...step, flatIndex }));
  }, [spanFilter, variant, waterfall.steps]);

  const flatSteps = useMemo(() => rows.map((r) => r as TraceWaterfallStep), [rows]);

  useEffect(() => {
    onFlatStepsChange?.(flatSteps);
  }, [flatSteps, onFlatStepsChange]);

  useEffect(() => {
    onZoomHandlersReady?.({ zoomIn, zoomOut, resetZoom });
  }, [onZoomHandlersReady, zoomIn, zoomOut, resetZoom]);

  const handleStepSelect = (step: TraceWaterfallStep) => {
    const next = selectedStepId === step.id ? null : step.id;
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(next);
    }
    onStepSelect?.(next ? step : null);
  };

  const handleStepHover = (step: TraceWaterfallStep | null) => {
    if (controlledHoveredId === undefined) {
      setInternalHoveredId(step?.id ?? null);
    }
    onStepHover?.(step);
  };

  const sections = useMemo<SectionModel[]>(() => {
    if (variant !== "unified") {
      return [{ id: "all", title: "", count: rows.length, rows }];
    }
    const mlairRows = rows.filter((row) => row.source === "mlair");
    const otelRows = rows.filter((row) => row.source === "otel");
    const out: SectionModel[] = [];
    if (mlairRows.length) {
      out.push({ id: "mlair", title: "Orchestration", count: mlairRows.length, rows: mlairRows });
    }
    if (otelRows.length) {
      out.push({ id: "otel", title: "OTLP spans", count: otelRows.length, rows: otelRows });
    }
    return out.length ? out : [{ id: "all", title: "", count: rows.length, rows }];
  }, [rows, variant]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col bg-card">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={zoomOut} aria-label="Zoom out">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" onClick={zoomIn} aria-label="Zoom in">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={resetZoom}
              disabled={!zoomDomain}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag timeline to zoom · ↑↓ navigate · Enter select
          </p>
        </div>

        <div
          className="sticky top-0 z-10 shrink-0 border-b border-border bg-card"
          role="rowgroup"
          aria-label="Timeline header"
        >
          <div
            className="grid items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
            role="row"
          >
            <span role="columnheader">Span</span>
            <span role="columnheader">Timeline</span>
            <span className="text-right" role="columnheader">
              Duration
            </span>
            <span className="text-right" role="columnheader">
              Status
            </span>
          </div>
        </div>

        <div className="scroll-region min-h-0 flex-1" role="grid" aria-label="Trace waterfall" aria-rowcount={rows.length}>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No spans match the current filter.</p>
          ) : (
            sections.map((section) => {
              const collapsed = Boolean(collapsedSections[section.id]);
              const showHeader = variant === "unified" && section.title;
              return (
                <div key={section.id} role="rowgroup" aria-label={section.title || "Spans"}>
                  {showHeader ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-default hover:bg-muted"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                      }
                      aria-expanded={!collapsed}
                    >
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 shrink-0 transition-default", collapsed && "-rotate-90")}
                      />
                      <span>{section.title}</span>
                      <span className="font-mono font-normal normal-case">{section.count}</span>
                    </button>
                  ) : null}
                  {!collapsed
                    ? section.rows.map((step) => (
                        <Tooltip key={`${step.source || "x"}-${step.id}`}>
                          <TooltipTrigger asChild>
                            <div>
                              <WaterfallRow
                                step={step}
                                scaleMs={scaleMs}
                                zoomMin={zoomMin}
                                isSelected={selectedStepId === step.id}
                                isHovered={hoveredStepId === step.id}
                                isFocused={focusedFlatIndex === step.flatIndex}
                                onSelect={handleStepSelect}
                                onHover={handleStepHover}
                                onZoomMouseDown={handleZoomMouseDown}
                                onZoomMouseMove={handleZoomMouseMove}
                                onZoomMouseUp={handleZoomMouseUp}
                                refAreaLeft={refAreaLeft}
                                refAreaRight={refAreaRight}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs space-y-1 text-left">
                            <p className="font-medium">{step.label}</p>
                            <p className="font-mono text-xs">{step.id}</p>
                            <p>{formatDateTimeCompact(step.start_ts)}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))
                    : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
