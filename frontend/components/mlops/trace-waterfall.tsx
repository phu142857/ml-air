"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { StatusBadge } from "@/components/mlops/status-badge";
import { HighlightText } from "@/components/mlops/trace-explorer/highlight-text";
import { TraceSpanContextMenu, TraceSpanRowMenu } from "@/components/mlops/trace-explorer/trace-span-context-menu";
import type { TraceSpanActionContext } from "@/components/mlops/trace-explorer/trace-span-actions";
import { TraceSpanBreadcrumb } from "@/components/mlops/trace-explorer/trace-span-breadcrumb";
import { buildSpanSearchMatchSet } from "@/components/mlops/trace-explorer/trace-span-search";
import {
  buildTraceTreeIndex,
  getRelatedSpanIds,
  isRowVisible,
} from "@/components/mlops/trace-explorer/trace-tree-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TraceDetailResponse, TraceOtelTrace, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { statusToMlopsBadge } from "@/lib/status-style";
import {
  buildTraceDurationContext,
  computeWaterfallStepDurationMs,
  type TraceDurationContext,
} from "@/lib/trace-duration";
import { formatDurationMs } from "@/lib/usage-format";
import { useWallClockNow } from "@/hooks/use-wall-clock-now";
import { cn, formatDateTimeCompact } from "@/lib/utils";

export { formatDurationMs as formatWaterfallDuration } from "@/lib/usage-format";

const LABEL_COL = "minmax(200px, 280px)";
const DURATION_COL = "80px";
const STATUS_COL = "88px";

const GRID_TEMPLATE = `${LABEL_COL} minmax(0, 1fr) ${DURATION_COL} ${STATUS_COL}`;

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
      className="relative h-5 cursor-crosshair overflow-hidden rounded-md border border-border/60 bg-muted/25"
      onMouseDown={onZoomMouseDown}
      onMouseMove={onZoomMouseMove}
      onMouseUp={onZoomMouseUp}
      onMouseLeave={onZoomMouseUp}
    >
      {refAreaLeft != null && refAreaRight != null ? (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-0 bg-primary/10 ring-1 ring-primary/30"
          style={{
            left: `${((Math.min(refAreaLeft, refAreaRight) - zoomMin) / scaleMs) * 100}%`,
            width: `${(Math.abs(refAreaRight - refAreaLeft) / scaleMs) * 100}%`,
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute transition-default",
          step.is_instant
            ? "top-0.5 bottom-0.5 w-1 -translate-x-1/2 rounded-sm bg-[color:var(--status-pending-fg)] shadow-[0_0_8px_color-mix(in_srgb,var(--status-pending-fg)_50%,transparent)]"
            : "top-0.5 bottom-0.5 min-w-[3px] rounded-sm border border-white/10",
          !step.is_instant && fill,
          isRunning && !step.is_instant && "shadow-[0_0_10px_color-mix(in_srgb,var(--status-running-fg)_35%,transparent)]",
          isHovered && "ring-2 ring-foreground/15",
          isSelected && "ring-2 ring-primary",
          isFocused && !isSelected && "ring-2 ring-ring/40",
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
  isDimmed,
  isRelated,
  isSearchMatch,
  isCurrentSearchMatch,
  isInspectorLocked,
  spanSearchQuery,
  onSelect,
  onHover,
  onZoomMouseDown,
  onZoomMouseMove,
  onZoomMouseUp,
  refAreaLeft,
  refAreaRight,
  rowMenu,
  durationContext,
}: {
  step: RowModel;
  scaleMs: number;
  zoomMin: number;
  isSelected?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  isDimmed?: boolean;
  isRelated?: boolean;
  isSearchMatch?: boolean;
  isCurrentSearchMatch?: boolean;
  isInspectorLocked?: boolean;
  spanSearchQuery?: string;
  onSelect?: (step: TraceWaterfallStep) => void;
  onHover?: (step: TraceWaterfallStep | null) => void;
  onZoomMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onZoomMouseUp?: () => void;
  refAreaLeft?: number | null;
  refAreaRight?: number | null;
  rowMenu?: ReactNode;
  durationContext: TraceDurationContext;
}) {
  const href = stepHref(step);
  const duration = step.is_instant
    ? null
    : computeWaterfallStepDurationMs(step, durationContext);
  const rowLabel = `${step.label}, ${step.is_instant ? "instant" : formatDurationMs(duration)}, ${step.status}`;

  return (
    <div
      className={cn(
        "group/row grid items-center gap-2 border-b border-border/50 px-3 py-2 transition-default",
        isSelected && "border-l-2 border-l-primary bg-primary/8",
        !isSelected && "border-l-2 border-l-transparent",
        isCurrentSearchMatch && "bg-primary/12 ring-1 ring-inset ring-primary/40",
        isInspectorLocked && "ring-2 ring-primary ring-offset-1 ring-offset-card",
        isSearchMatch && !isCurrentSearchMatch && !isSelected && !isInspectorLocked && "bg-primary/5",
        isRelated && !isSelected && !isSearchMatch && "bg-primary/5",
        isHovered && !isSelected && "bg-muted/50",
        isFocused && !isSelected && "bg-muted/40",
        isDimmed && "opacity-35",
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
      aria-current={isCurrentSearchMatch ? "true" : undefined}
      aria-label={rowLabel}
      data-flat-index={step.flatIndex}
      data-step-id={step.id}
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
                <HighlightText text={step.label} query={spanSearchQuery ?? ""} />
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-foreground">
                <HighlightText text={step.label} query={spanSearchQuery ?? ""} />
              </p>
            )}
            {step.service ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                <HighlightText text={step.service} query={spanSearchQuery ?? ""} />
              </p>
            ) : null}
          </div>
          {rowMenu ? <div className="shrink-0">{rowMenu}</div> : null}
        </div>
      </div>

      <div role="gridcell" className="relative z-0 min-w-0 overflow-hidden">
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

      <div
        className="relative z-10 shrink-0 bg-inherit text-right font-mono text-xs tabular-nums text-foreground"
        role="gridcell"
      >
        {step.is_instant ? (
          <span className="text-muted-foreground">instant</span>
        ) : (
          formatDurationMs(duration)
        )}
      </div>

      <div className="relative z-10 flex shrink-0 justify-center bg-inherit" role="gridcell">
        <StatusBadge
          value={step.status}
          size="sm"
          showIcon={false}
          live={statusToMlopsBadge(step.status) === "running"}
        />
      </div>
    </div>
  );
}

export type TraceWaterfallViewProps = {
  waterfall: TraceWaterfall;
  variant?: "run" | "otel" | "unified";
  selectedStep?: TraceWaterfallStep | null;
  selectedStepId?: string | null;
  hoveredStepId?: string | null;
  focusedFlatIndex?: number | null;
  spanFilter?: string;
  currentSearchMatchId?: string | null;
  collapsedSpanIds?: Set<string>;
  onStepSelect?: (step: TraceWaterfallStep | null) => void;
  onStepHover?: (step: TraceWaterfallStep | null) => void;
  onFlatStepsChange?: (steps: TraceWaterfallStep[]) => void;
  onAllStepsChange?: (steps: TraceWaterfallStep[]) => void;
  onSearchMatchesChange?: (orderedMatchIds: string[]) => void;
  traceId?: string;
  traceDetail?: TraceDetailResponse | null;
  spanActionContext?: Omit<TraceSpanActionContext, "traceId" | "step" | "data" | "waterfall" | "treeNode">;
  onOpenLogsTab?: () => void;
  onJumpToParent?: (step: TraceWaterfallStep) => void;
  onCollapseOthers?: (step: TraceWaterfallStep) => void;
  onExpandAll?: () => void;
  onZoomHandlersReady?: (handlers: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  }) => void;
  zoomDomain?: [number, number] | null;
  onZoomDomainChange?: (domain: [number, number] | null) => void;
  inspectorEnabled?: boolean;
  inspectorLockedSpanId?: string | null;
  waterfallRegionRef?: React.RefObject<HTMLDivElement | null>;
  durationContext?: TraceDurationContext;
};

export function TraceWaterfallView({
  waterfall,
  variant = "run",
  selectedStep = null,
  selectedStepId: controlledSelectedId,
  hoveredStepId: controlledHoveredId,
  focusedFlatIndex = null,
  spanFilter = "",
  currentSearchMatchId = null,
  collapsedSpanIds,
  onStepSelect,
  onStepHover,
  onFlatStepsChange,
  onAllStepsChange,
  onSearchMatchesChange,
  traceId = "",
  traceDetail = null,
  spanActionContext,
  onOpenLogsTab,
  onJumpToParent,
  onCollapseOthers,
  onExpandAll,
  onZoomHandlersReady,
  zoomDomain: controlledZoomDomain,
  onZoomDomainChange,
  inspectorEnabled = false,
  inspectorLockedSpanId = null,
  waterfallRegionRef,
  durationContext: durationContextProp,
}: TraceWaterfallViewProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [internalHoveredId, setInternalHoveredId] = useState<string | null>(null);
  const isLive = traceDetail?.is_live ?? false;
  const wallClockNowMs = useWallClockNow(isLive);
  const durationContext = useMemo(
    () => durationContextProp ?? buildTraceDurationContext(traceDetail, wallClockNowMs),
    [durationContextProp, traceDetail, wallClockNowMs],
  );
  const selectedStepId =
    selectedStep?.id ??
    (controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId);
  const hoveredStepId = controlledHoveredId !== undefined ? controlledHoveredId : internalHoveredId;

  const treeIndex = useMemo(
    () => buildTraceTreeIndex(waterfall.steps),
    [waterfall.steps],
  );

  const relatedSpanIds = useMemo(() => {
    if (!hoveredStepId) return null;
    return getRelatedSpanIds(treeIndex, hoveredStepId);
  }, [hoveredStepId, treeIndex]);

  const totalMs = Math.max(waterfall.total_ms, 1);
  const [internalZoomDomain, setInternalZoomDomain] = useState<[number, number] | null>(null);
  const zoomDomain =
    controlledZoomDomain !== undefined ? controlledZoomDomain : internalZoomDomain;
  const setZoomDomain = useCallback(
    (domain: [number, number] | null) => {
      if (onZoomDomainChange) onZoomDomainChange(domain);
      else setInternalZoomDomain(domain);
    },
    [onZoomDomainChange],
  );
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
  }, [refAreaLeft, refAreaRight, scaleMs, setZoomDomain, totalMs]);

  const resetZoom = useCallback(() => setZoomDomain(null), [setZoomDomain]);

  const zoomIn = useCallback(() => {
    const span = zoomMax - zoomMin;
    const nextSpan = Math.max(span * 0.5, 10);
    const center = (zoomMin + zoomMax) / 2;
    setZoomDomain([
      Math.max(0, center - nextSpan / 2),
      Math.min(totalMs, center + nextSpan / 2),
    ]);
  }, [setZoomDomain, totalMs, zoomMax, zoomMin]);

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
  }, [setZoomDomain, totalMs, zoomMax, zoomMin]);

  const rows = useMemo<RowModel[]>(() => {
    const unifiedMode = variant === "unified";
    const otelMode = variant === "otel" || waterfall.steps.some((s) => s.kind === "span");
    const collapsed = collapsedSpanIds ?? new Set<string>();

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

    const treeVisible = base.filter((step) => isRowVisible(step.id, collapsed, treeIndex));
    return treeVisible.map((step, flatIndex) => ({ ...step, flatIndex }));
  }, [collapsedSpanIds, treeIndex, variant, waterfall.steps]);

  const spanSearchQuery = spanFilter.trim();
  const searchMatches = useMemo(
    () => buildSpanSearchMatchSet(rows, spanSearchQuery),
    [rows, spanSearchQuery],
  );

  const allSteps = useMemo(
    () => waterfall.steps as TraceWaterfallStep[],
    [waterfall.steps],
  );

  const flatSteps = useMemo(() => rows.map((r) => r as TraceWaterfallStep), [rows]);
  const hasTree = allSteps.length > 1;

  const buildRowActionContext = useCallback(
    (step: TraceWaterfallStep): TraceSpanActionContext => ({
      traceId,
      step,
      data: traceDetail,
      waterfall,
      treeNode: treeIndex.get(step.id) ?? null,
      hasTree,
      onOpenLogsTab,
      onJumpToParent: () => onJumpToParent?.(step),
      onCollapseOthers: () => onCollapseOthers?.(step),
      onExpandAll,
      ...spanActionContext,
    }),
    [
      hasTree,
      onCollapseOthers,
      onExpandAll,
      onJumpToParent,
      onOpenLogsTab,
      spanActionContext,
      traceDetail,
      traceId,
      treeIndex,
      waterfall,
    ],
  );

  const prevSearchMatchIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const next = searchMatches.orderedMatchIds;
    const prev = prevSearchMatchIdsRef.current;
    if (prev.length === next.length && prev.every((id, index) => id === next[index])) return;
    prevSearchMatchIdsRef.current = next;
    onSearchMatchesChange?.(next);
  }, [onSearchMatchesChange, searchMatches.orderedMatchIds]);

  useEffect(() => {
    onFlatStepsChange?.(flatSteps);
  }, [flatSteps, onFlatStepsChange]);

  useEffect(() => {
    onAllStepsChange?.(allSteps);
  }, [allSteps, onAllStepsChange]);

  useEffect(() => {
    onZoomHandlersReady?.({ zoomIn, zoomOut, resetZoom });
  }, [onZoomHandlersReady, zoomIn, zoomOut, resetZoom]);

  const handleStepSelect = (step: TraceWaterfallStep) => {
    const shouldDeselect = !inspectorEnabled && selectedStepId === step.id;
    const next = shouldDeselect ? null : step.id;
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

  useEffect(() => {
    if (focusedFlatIndex == null) return;
    const row = document.querySelector(`[data-flat-index="${focusedFlatIndex}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [focusedFlatIndex, currentSearchMatchId]);

  useEffect(() => {
    if (!currentSearchMatchId) return;
    const row = document.querySelector(`[data-step-id="${CSS.escape(currentSearchMatchId)}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [currentSearchMatchId]);

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
        <TraceSpanBreadcrumb
          steps={allSteps}
          selectedStep={selectedStep}
          onSelectStep={onStepSelect ?? (() => undefined)}
        />

        <div
          ref={waterfallRegionRef}
          tabIndex={-1}
          data-trace-region="waterfall"
          className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
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
                      className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/25 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-default hover:bg-muted/50"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                      }
                      aria-expanded={!collapsed}
                    >
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 shrink-0 transition-default", collapsed && "-rotate-90")}
                      />
                      <span>{section.title}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal normal-case text-muted-foreground">
                        {section.count}
                      </span>
                    </button>
                  ) : null}
                  {!collapsed
                    ? section.rows.map((step) => {
                        const isSearchMatch = searchMatches.matchIds.has(step.id);
                        const isCurrentSearchMatch = currentSearchMatchId === step.id;
                        const searchActive = Boolean(spanSearchQuery);
                        const isSearchDimmed =
                          searchActive &&
                          !isSearchMatch &&
                          selectedStepId !== step.id &&
                          hoveredStepId !== step.id;

                        return (
                        <Tooltip key={`${step.source || "x"}-${step.id}`}>
                          <TooltipTrigger asChild>
                            <TraceSpanContextMenu context={buildRowActionContext(step)}>
                              <WaterfallRow
                                step={step}
                                scaleMs={scaleMs}
                                zoomMin={zoomMin}
                                isSelected={selectedStepId === step.id}
                                isHovered={hoveredStepId === step.id}
                                isFocused={focusedFlatIndex === step.flatIndex}
                                isDimmed={
                                  Boolean(relatedSpanIds && !relatedSpanIds.has(step.id)) ||
                                  isSearchDimmed
                                }
                                isRelated={Boolean(relatedSpanIds?.has(step.id))}
                                isSearchMatch={isSearchMatch}
                                isCurrentSearchMatch={isCurrentSearchMatch}
                                isInspectorLocked={inspectorLockedSpanId === step.id}
                                spanSearchQuery={spanSearchQuery}
                                onSelect={handleStepSelect}
                                onHover={handleStepHover}
                                onZoomMouseDown={handleZoomMouseDown}
                                onZoomMouseMove={handleZoomMouseMove}
                                onZoomMouseUp={handleZoomMouseUp}
                                refAreaLeft={refAreaLeft}
                                refAreaRight={refAreaRight}
                                rowMenu={<TraceSpanRowMenu context={buildRowActionContext(step)} />}
                                durationContext={durationContext}
                              />
                            </TraceSpanContextMenu>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs space-y-1 text-left">
                            <p className="font-medium">{step.label}</p>
                            <p className="font-mono text-xs">{step.id}</p>
                            <p>Start: {formatDateTimeCompact(step.start_ts)}</p>
                            <p>Offset: +{formatDurationMs(step.offset_ms)}</p>
                            <p>
                              Duration:{" "}
                              {formatDurationMs(
                                step.is_instant
                                  ? null
                                  : computeWaterfallStepDurationMs(step, durationContext),
                              )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                        );
                      })
                    : null}
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
