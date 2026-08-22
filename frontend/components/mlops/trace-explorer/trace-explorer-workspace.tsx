"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Copy, Download, Link2, List, Loader2, Maximize2, Minimize2, Minus, PanelRight, Play, Plus, RotateCcw, Route, ScanSearch, Search } from "lucide-react";

import { MlopsEmptyState } from "@/components/mlops/layout";
import { TraceListPane } from "@/components/mlops/trace-explorer/trace-list-pane";
import { TracePaneRail } from "@/components/mlops/trace-explorer/trace-pane-rail";
import {
  TraceSpanDetailsPane,
  type TraceSpanDetailsPaneHandle,
} from "@/components/mlops/trace-explorer/trace-span-details";
import {
  collectDescendantIds,
  buildTraceTreeIndex,
  getAncestorChain,
} from "@/components/mlops/trace-explorer/trace-tree-utils";
import {
  findStepByFlatIndex,
  useTraceExplorerKeyboard,
  type TraceFocusRegion,
} from "@/components/mlops/trace-explorer/use-trace-explorer-keyboard";
import { TraceWorkspaceEmpty } from "@/components/mlops/trace-explorer/trace-workspace-empty";
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog";
import { TraceWaterfallView } from "@/components/mlops/trace-waterfall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTraceDetail } from "@/hooks/use-trace-detail";
import { useTraceInspector } from "@/hooks/use-trace-inspector";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  TRACE_WORKSPACE_COLLAPSED_SIZE,
  useTraceWorkspaceState,
} from "@/hooks/use-trace-workspace-state";
import { SPAN_SEARCH_DEBOUNCE_MS } from "@/components/mlops/trace-explorer/trace-span-search";
import { useAppContext } from "@/lib/app-context";
import type { TraceSearchHit, TraceWaterfallStep } from "@/lib/api";
import { buildTraceShareUrl, downloadTraceExport, replayFromTask } from "@/lib/api";
import { copyWithToast, toastError, toastSuccess } from "@/lib/toast-actions";
import { normalizeTraceId } from "@/lib/trace-id";
import { useRouter } from "next/navigation";
import { formatApiClientError } from "@/lib/utils";

export type TraceExplorerWorkspaceProps = {
  traceList: TraceSearchHit[];
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string) => void;
  traceSearch: string;
  onTraceSearchChange: (value: string) => void;
  listLoading?: boolean;
  onOpenLogsTab?: () => void;
  urlSpanId?: string | null;
  urlZoom?: [number, number] | null;
  urlQ?: string;
  onUrlSpanChange?: (spanId: string | null) => void;
  onUrlZoomChange?: (zoom: [number, number] | null) => void;
  onUrlQChange?: (q: string) => void;
  className?: string;
};

export function TraceExplorerWorkspace({
  traceList,
  selectedTraceId,
  onSelectTrace,
  traceSearch,
  onTraceSearchChange,
  listLoading,
  onOpenLogsTab,
  urlSpanId,
  urlZoom,
  urlQ = "",
  onUrlSpanChange,
  onUrlZoomChange,
  onUrlQChange,
}: TraceExplorerWorkspaceProps) {
  const { tenantId, projectId, token } = useAppContext();
  const router = useRouter();
  const normalized = selectedTraceId ? normalizeTraceId(selectedTraceId) || selectedTraceId.trim() : "";

  const workspace = useTraceWorkspaceState({ tenantId, projectId });
  const inspector = useTraceInspector();

  const { data, isLoading } = useTraceDetail(
    tenantId,
    projectId,
    token,
    normalized,
    Boolean(normalized),
  );

  const [selectedStep, setSelectedStep] = useState<TraceWaterfallStep | null>(null);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [focusedFlatIndex, setFocusedFlatIndex] = useState<number | null>(null);
  const [spanFilter, setSpanFilter] = useState(urlQ);
  const debouncedSpanFilter = useDebouncedValue(spanFilter, SPAN_SEARCH_DEBOUNCE_MS);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(urlZoom ?? null);
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [replayPending, setReplayPending] = useState(false);
  const [flatSteps, setFlatSteps] = useState<TraceWaterfallStep[]>([]);
  const [allSteps, setAllSteps] = useState<TraceWaterfallStep[]>([]);
  const [collapsedSpanIds, setCollapsedSpanIds] = useState<Set<string>>(() => new Set());
  const zoomHandlersRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  } | null>(null);

  const traceListSearchRef = useRef<HTMLInputElement>(null);
  const spanFilterRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const waterfallRegionRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<TraceSpanDetailsPaneHandle>(null);
  const focusRegionRef = useRef<TraceFocusRegion>("waterfall");
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const invalidSpanWarnedRef = useRef<string | null>(null);
  const hydratedSpanKeyRef = useRef<string | null>(null);
  const urlQWriteSkipRef = useRef(false);

  const waterfall = data?.unified_waterfall ?? data?.waterfall ?? null;
  const waterfallVariant = data?.unified_waterfall ? "unified" : "run";

  const selectedStepId = selectedStep?.id ?? null;
  const currentSearchMatchId =
    debouncedSpanFilter.trim() && searchMatchIds.length
      ? searchMatchIds[searchMatchIndex] ?? null
      : null;

  const previewStep = useMemo(() => {
    if (!inspector.inspectorEnabled || inspector.inspectorLockedSpanId || !hoveredStepId) {
      return null;
    }
    return allSteps.find((step) => step.id === hoveredStepId) ?? null;
  }, [allSteps, hoveredStepId, inspector.inspectorEnabled, inspector.inspectorLockedSpanId]);

  const detailStep = useMemo(() => {
    if (!inspector.inspectorEnabled) return selectedStep;
    if (inspector.inspectorLockedSpanId) {
      return allSteps.find((step) => step.id === inspector.inspectorLockedSpanId) ?? selectedStep;
    }
    return previewStep;
  }, [
    allSteps,
    inspector.inspectorEnabled,
    inspector.inspectorLockedSpanId,
    previewStep,
    selectedStep,
  ]);

  useEffect(() => {
    if (urlQ === undefined) return;
    if (urlQ === spanFilter) return;
    urlQWriteSkipRef.current = true;
    setSpanFilter(urlQ);
  }, [urlQ, spanFilter]);

  useEffect(() => {
    if (!onUrlQChange || urlQWriteSkipRef.current) {
      urlQWriteSkipRef.current = false;
      return;
    }
    if (debouncedSpanFilter === (urlQ ?? "")) return;
    onUrlQChange(debouncedSpanFilter);
  }, [debouncedSpanFilter, onUrlQChange, urlQ]);

  useEffect(() => {
    setZoomDomain(urlZoom ?? null);
  }, [urlZoom]);

  useEffect(() => {
    if (!onUrlZoomChange) return;
    const current = urlZoom ?? null;
    const same =
      (zoomDomain == null && current == null) ||
      (zoomDomain != null &&
        current != null &&
        zoomDomain[0] === current[0] &&
        zoomDomain[1] === current[1]);
    if (!same) onUrlZoomChange(zoomDomain);
  }, [onUrlZoomChange, urlZoom, zoomDomain]);

  useEffect(() => {
    if (!onUrlSpanChange) return;
    if ((selectedStepId ?? null) === (urlSpanId ?? null)) return;
    onUrlSpanChange(selectedStepId);
  }, [onUrlSpanChange, selectedStepId, urlSpanId]);

  useEffect(() => {
    invalidSpanWarnedRef.current = null;
    hydratedSpanKeyRef.current = null;
    inspector.resetInspector();
  }, [inspector.resetInspector, normalized]);

  const handleTraceChange = useCallback(
    (traceId: string) => {
      setSelectedStep(null);
      setFocusedFlatIndex(null);
      setSpanFilter("");
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      setCollapsedSpanIds(new Set());
      setZoomDomain(null);
      inspector.resetInspector();
      onSelectTrace(traceId);
    },
    [inspector.resetInspector, onSelectTrace],
  );

  const handleStepSelect = useCallback(
    (step: TraceWaterfallStep | null) => {
      if (!step) {
        setSelectedStep(null);
        setFocusedFlatIndex(null);
        return;
      }

      const tree = buildTraceTreeIndex(allSteps);
      setCollapsedSpanIds((prev) => {
        const next = new Set(prev);
        for (const node of getAncestorChain(tree, step.id)) {
          next.delete(node.id);
        }
        return next;
      });

      setSelectedStep(step);
      const index = flatSteps.findIndex((item) => item.id === step.id);
      setFocusedFlatIndex(index >= 0 ? index : null);
    },
    [allSteps, flatSteps],
  );

  useEffect(() => {
    if (!urlSpanId || !allSteps.length) return;
    const hydrationKey = `${normalized}:${urlSpanId}`;
    if (hydratedSpanKeyRef.current === hydrationKey) return;

    const step = allSteps.find((item) => item.id === urlSpanId);
    if (step) {
      hydratedSpanKeyRef.current = hydrationKey;
      handleStepSelect(step);
      return;
    }

    if (invalidSpanWarnedRef.current !== hydrationKey) {
      invalidSpanWarnedRef.current = hydrationKey;
      toastError("Span not found", "The linked span is not in this trace.");
      onUrlSpanChange?.(null);
    }
  }, [allSteps, handleStepSelect, normalized, onUrlSpanChange, urlSpanId]);

  const handleWaterfallStepSelect = useCallback(
    (step: TraceWaterfallStep | null) => {
      if (!step) {
        handleStepSelect(null);
        inspector.unlockSpan();
        return;
      }
      handleStepSelect(step);
      if (inspector.inspectorEnabled) {
        inspector.lockSpan(step.id);
      }
    },
    [handleStepSelect, inspector.inspectorEnabled, inspector.lockSpan, inspector.unlockSpan],
  );

  const handleSearchMatchesChange = useCallback(
    (orderedMatchIds: string[]) => {
      setSearchMatchIds(orderedMatchIds);
      if (!debouncedSpanFilter.trim()) {
        setSearchMatchIndex(0);
        return;
      }

      setSearchMatchIndex(0);
      const firstId = orderedMatchIds[0];
      if (!firstId) return;

      const step = flatSteps.find((item) => item.id === firstId);
      if (step) handleStepSelect(step);
    },
    [debouncedSpanFilter, flatSteps, handleStepSelect],
  );

  const cycleSearchMatch = useCallback(
    (delta: 1 | -1) => {
      if (!searchMatchIds.length) return;
      setSearchMatchIndex((prev) => {
        const next = (prev + delta + searchMatchIds.length) % searchMatchIds.length;
        const stepId = searchMatchIds[next];
        const step = flatSteps.find((item) => item.id === stepId);
        if (step) handleStepSelect(step);
        return next;
      });
    },
    [flatSteps, handleStepSelect, searchMatchIds],
  );

  useEffect(() => {
    if (!selectedStepId || !searchMatchIds.length || !debouncedSpanFilter.trim()) return;
    const index = searchMatchIds.indexOf(selectedStepId);
    if (index >= 0) setSearchMatchIndex(index);
  }, [debouncedSpanFilter, searchMatchIds, selectedStepId]);

  const focusRegion = useCallback((region: TraceFocusRegion) => {
    focusRegionRef.current = region;
    switch (region) {
      case "trace-list":
        traceListSearchRef.current?.focus();
        break;
      case "waterfall":
        waterfallRegionRef.current?.focus();
        break;
      case "detail":
        if (workspace.rightCollapsed) workspace.setRightCollapsed(false);
        detailPaneRef.current?.focusFirstInteractive();
        break;
      case "toolbar": {
        const firstButton = toolbarRef.current?.querySelector<HTMLElement>("button:not([disabled])");
        firstButton?.focus();
        break;
      }
      default:
        break;
    }
  }, [workspace]);

  const cycleFocusRegion = useCallback(
    (direction: 1 | -1) => {
      const order: TraceFocusRegion[] = ["trace-list", "waterfall", "detail", "toolbar"];
      const currentIndex = order.indexOf(focusRegionRef.current);
      const nextIndex = (currentIndex + direction + order.length) % order.length;
      focusRegion(order[nextIndex]!);
    },
    [focusRegion],
  );

  const collapseSubtree = useCallback(() => {
    if (!selectedStep) return;
    const tree = buildTraceTreeIndex(allSteps);
    const node = tree.get(selectedStep.id);
    if (!node?.childIds.length) return;
    setCollapsedSpanIds((prev) => new Set(prev).add(selectedStep.id));
  }, [allSteps, selectedStep]);

  const expandSubtree = useCallback(() => {
    if (!selectedStep) return;
    setCollapsedSpanIds((prev) => {
      const next = new Set(prev);
      next.delete(selectedStep.id);
      const tree = buildTraceTreeIndex(allSteps);
      for (const id of collectDescendantIds(tree, selectedStep.id)) {
        next.delete(id);
      }
      return next;
    });
  }, [allSteps, selectedStep]);

  const jumpToParent = useCallback(
    (step: TraceWaterfallStep = selectedStep!) => {
      if (!step) return;
      const tree = buildTraceTreeIndex(allSteps);
      const node = tree.get(step.id);
      if (!node?.parentId) return;
      const parent = tree.get(node.parentId);
      if (parent) handleStepSelect(parent.step);
    },
    [allSteps, handleStepSelect, selectedStep],
  );

  const collapseOthers = useCallback(
    (step: TraceWaterfallStep = selectedStep!) => {
      if (!step) return;
      const tree = buildTraceTreeIndex(allSteps);
      const keepExpanded = new Set(getAncestorChain(tree, step.id).map((node) => node.id));
      const next = new Set<string>();
      for (const [id, node] of tree) {
        if (node.childIds.length > 0 && !keepExpanded.has(id)) {
          next.add(id);
        }
      }
      setCollapsedSpanIds(next);
    },
    [allSteps, selectedStep],
  );

  const expandAll = useCallback(() => {
    setCollapsedSpanIds(new Set());
  }, []);

  const handleReplayFromTask = useCallback(
    async (runId: string, taskId: string) => {
      if (!tenantId || !projectId || !token || projectId === "all") {
        toastError("Replay unavailable", "Pin a tenant/project scope first.");
        return;
      }
      setReplayPending(true);
      try {
        const created = await replayFromTask(tenantId, projectId, runId, token, {
          from_task_id: taskId,
        });
        toastSuccess("Replay started", created.run_id);
        router.push(`/runs/${encodeURIComponent(created.run_id)}`);
      } catch (e: unknown) {
        toastError("Replay failed", formatApiClientError(e));
      } finally {
        setReplayPending(false);
      }
    },
    [projectId, router, tenantId, token],
  );

  const spanActionContextExtras = useMemo(
    () => ({
      hasTree: allSteps.length > 1,
      logsAvailable: Boolean((data?.log_count ?? 0) > 0),
      onOpenLogsTab,
      onJumpToParent: () => jumpToParent(),
      onCollapseOthers: () => collapseOthers(),
      onExpandAll: expandAll,
      onReplayFromTask: handleReplayFromTask,
      replayPending,
    }),
    [
      allSteps.length,
      collapseOthers,
      data?.log_count,
      expandAll,
      handleReplayFromTask,
      jumpToParent,
      onOpenLogsTab,
      replayPending,
    ],
  );

  const focusDetailPanel = useCallback(() => {
    if (!selectedStep && flatSteps.length) {
      const step = findStepByFlatIndex(flatSteps, focusedFlatIndex ?? 0);
      if (step) handleStepSelect(step);
    }
    focusRegion("detail");
  }, [flatSteps, focusRegion, focusedFlatIndex, handleStepSelect, selectedStep]);

  const copyCurrentId = useCallback(() => {
    const value = selectedStep?.id ?? normalized;
    if (!value) return;
    void copyWithToast(value, { successTitle: "Copied" });
  }, [normalized, selectedStep]);

  const isWaterfallFocused = useCallback(() => {
    const active = document.activeElement;
    if (!active) return true;
    if (active.id === "trace-list-search" || active.id === "span-filter") return false;
    return !active.closest('[data-trace-region="trace-list"], [data-trace-region="detail"], [data-trace-region="toolbar"]');
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (!flatSteps.length) return;
      setFocusedFlatIndex((prev) => {
        const current = prev ?? (selectedStep ? flatSteps.findIndex((s) => s.id === selectedStep.id) : -1);
        const next = Math.min(flatSteps.length - 1, Math.max(0, current + delta));
        const step = findStepByFlatIndex(flatSteps, next);
        if (step) handleStepSelect(step);
        return next;
      });
    },
    [flatSteps, handleStepSelect, selectedStep],
  );

  const toggleFullscreen = useCallback(() => {
    workspace.setWaterfallFullscreen((prev) => !prev);
  }, [workspace]);

  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (workspace.leftCollapsed) panel.collapse();
    else panel.expand();
  }, [workspace.leftCollapsed]);

  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (workspace.rightCollapsed) panel.collapse();
    else panel.expand();
  }, [workspace.rightCollapsed]);

  useTraceExplorerKeyboard(Boolean(normalized) || workspace.waterfallFullscreen, {
    onFocusSearch: () => {
      focusRegion("trace-list");
    },
    onMoveSelection: moveSelection,
    onFocusDetailPanel: focusDetailPanel,
    onClearSelection: () => {
      setSelectedStep(null);
      setFocusedFlatIndex(null);
      inspector.unlockSpan();
    },
    onUnlockInspector: inspector.unlockSpan,
    onExitFullscreen: workspace.exitFullscreen,
    onClearSpanFilter: () => {
      if (!spanFilter) return false;
      setSpanFilter("");
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      spanFilterRef.current?.focus();
      return true;
    },
    onClearTraceSearch: () => {
      if (!traceSearch.trim()) return false;
      onTraceSearchChange("");
      traceListSearchRef.current?.focus();
      return true;
    },
    onCollapseSubtree: collapseSubtree,
    onExpandSubtree: expandSubtree,
    onCopyId: copyCurrentId,
    onCycleFocusRegion: cycleFocusRegion,
    hasSearchMatches: () =>
      Boolean(debouncedSpanFilter.trim()) && searchMatchIds.length > 0,
    onNextSearchMatch: () => cycleSearchMatch(1),
    onPrevSearchMatch: () => cycleSearchMatch(-1),
    isWaterfallFocused,
    onZoomIn: () => zoomHandlersRef.current?.zoomIn(),
    onZoomOut: () => zoomHandlersRef.current?.zoomOut(),
    onResetZoom: () => zoomHandlersRef.current?.resetZoom(),
  });

  const copyTraceId = () =>
    void copyWithToast(normalized, {
      successTitle: "Trace ID copied",
    });

  const copyShareLink = () =>
    void copyWithToast(
      buildTraceShareUrl(normalized, {
        spanId: selectedStepId,
        zoom: zoomDomain,
        q: spanFilter,
      }),
      {
        successTitle: "Share link copied",
      },
    );

  const handleExport = async () => {
    if (!normalized || tenantId === "all" || projectId === "all") return;
    setExporting(true);
    try {
      await downloadTraceExport(tenantId, projectId, token, normalized);
      toastSuccess("Trace exported", `mlair-trace-${normalized.slice(0, 16)}.json`);
    } catch (err) {
      toastError("Export failed", String((err as Error)?.message || err));
    } finally {
      setExporting(false);
    }
  };

  const listEmptyAction = useMemo(
    () =>
      !listLoading && traceList.length === 0 && !traceSearch.trim() ? (
        <div className="px-3 py-6">
          <MlopsEmptyState
            icon={Route}
            title="No traces yet"
            action={
              <Button type="button" size="sm" onClick={() => setTriggerOpen(true)}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Trigger Run
              </Button>
            }
          />
        </div>
      ) : undefined,
    [listLoading, traceList.length, traceSearch],
  );

  const centerContent = useMemo(
    () => (
      <div className="flex h-full min-h-0 flex-col border-x border-border bg-card">
        <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/20 px-2 py-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="span-filter" className="sr-only">
              Search spans
            </label>
            <Input
              id="span-filter"
              ref={spanFilterRef}
              value={spanFilter}
              onChange={(e) => setSpanFilter(e.target.value)}
              placeholder="Search spans… (F3)"
              className="h-8 border-border/70 bg-background pl-8 text-xs"
              disabled={!waterfall}
              aria-keyshortcuts="F3"
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              disabled={!waterfall}
              onClick={() => zoomHandlersRef.current?.zoomOut()}
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              disabled={!waterfall}
              onClick={() => zoomHandlersRef.current?.zoomIn()}
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-[11px]"
              disabled={!waterfall || !zoomDomain}
              onClick={() => zoomHandlersRef.current?.resetZoom()}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-[11px]"
              disabled={!waterfall}
              onClick={toggleFullscreen}
              aria-pressed={workspace.waterfallFullscreen}
            >
              {workspace.waterfallFullscreen ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
              {workspace.waterfallFullscreen ? "Exit" : "Full"}
            </Button>
          </div>
        </div>
        {debouncedSpanFilter.trim() ? (
          <p className="shrink-0 border-b border-border/50 bg-card px-3 py-0.5 text-[11px] text-muted-foreground" aria-live="polite">
            {searchMatchIds.length
              ? `${searchMatchIndex + 1} of ${searchMatchIds.length} matches · ↑↓ navigate · F3 next`
              : "No matches"}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          {!normalized ? (
            <div className="flex h-full items-center justify-center p-6">
              <TraceWorkspaceEmpty onTriggerRun={() => setTriggerOpen(true)} />
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading waterfall…
            </div>
          ) : !waterfall ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No timing data for this trace.
            </p>
          ) : (
            <TraceWaterfallView
              waterfall={waterfall}
              variant={waterfallVariant}
              selectedStep={selectedStep}
              selectedStepId={selectedStepId}
              hoveredStepId={hoveredStepId}
              focusedFlatIndex={focusedFlatIndex}
              spanFilter={debouncedSpanFilter}
              currentSearchMatchId={currentSearchMatchId}
              collapsedSpanIds={collapsedSpanIds}
              onStepSelect={handleWaterfallStepSelect}
              onStepHover={(step) => setHoveredStepId(step?.id ?? null)}
              onFlatStepsChange={setFlatSteps}
              onAllStepsChange={setAllSteps}
              onSearchMatchesChange={handleSearchMatchesChange}
              zoomDomain={zoomDomain}
              onZoomDomainChange={setZoomDomain}
              inspectorEnabled={inspector.inspectorEnabled}
              inspectorLockedSpanId={inspector.inspectorLockedSpanId}
              traceId={normalized}
              traceDetail={data}
              spanActionContext={spanActionContextExtras}
              onOpenLogsTab={onOpenLogsTab}
              onJumpToParent={jumpToParent}
              onCollapseOthers={collapseOthers}
              onExpandAll={expandAll}
              onZoomHandlersReady={(handlers) => {
                zoomHandlersRef.current = handlers;
              }}
              waterfallRegionRef={waterfallRegionRef}
            />
          )}
        </div>
      </div>
    ),
    [
      focusedFlatIndex,
      hoveredStepId,
      isLoading,
      listLoading,
      normalized,
      selectedStepId,
      debouncedSpanFilter,
      searchMatchIds.length,
      searchMatchIndex,
      collapsedSpanIds,
      selectedStep,
      handleWaterfallStepSelect,
      zoomDomain,
      inspector.inspectorEnabled,
      inspector.inspectorLockedSpanId,
      handleSearchMatchesChange,
      spanFilter,
      currentSearchMatchId,
      normalized,
      data,
      spanActionContextExtras,
      onOpenLogsTab,
      jumpToParent,
      collapseOthers,
      expandAll,
      toggleFullscreen,
      waterfall,
      waterfallVariant,
      workspace.waterfallFullscreen,
    ],
  );

  const toolbar = useMemo(
    () => (
      <div
        ref={toolbarRef}
        data-trace-region="toolbar"
        className="sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-3 backdrop-blur-sm sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <code className="truncate font-mono text-xs font-medium text-foreground">
            {normalized || "Select a trace"}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={inspector.inspectorEnabled ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            aria-pressed={inspector.inspectorEnabled}
            aria-label="Toggle inspector mode"
            title="Inspect spans: hover to preview, click to lock, Esc to unlock"
            onClick={inspector.toggleInspector}
          >
            <ScanSearch className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Inspect
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={workspace.waterfallFullscreen}
            onClick={workspace.resetLayout}
          >
            Reset layout
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={!normalized}
            onClick={() => void copyTraceId()}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ID
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={!normalized}
            onClick={() => void copyShareLink()}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Share
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={exporting || !data}
            onClick={() => void handleExport()}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Export
          </Button>
        </div>
      </div>
    ),
    [
      data,
      exporting,
      normalized,
      workspace.resetLayout,
      workspace.waterfallFullscreen,
      inspector.inspectorEnabled,
      inspector.toggleInspector,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TriggerRunDialog open={triggerOpen} onOpenChange={setTriggerOpen} />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedStep
          ? `Selected span ${selectedStep.label}, status ${selectedStep.status}`
          : ""}
      </div>

      {toolbar}

      {workspace.waterfallFullscreen ? (
        <div className="min-h-0 flex-1 overflow-hidden">{centerContent}</div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          className="min-h-0 flex-1"
          onLayout={workspace.handlePanelLayout}
        >
          <ResizablePanel
            ref={leftPanelRef}
            id="trace-list"
            defaultSize={workspace.defaultPanelSizes.left}
            minSize={16}
            maxSize={35}
            collapsible
            collapsedSize={TRACE_WORKSPACE_COLLAPSED_SIZE}
            onCollapse={() => workspace.setLeftCollapsed(true)}
            onExpand={() => workspace.setLeftCollapsed(false)}
          >
            {workspace.leftCollapsed ? (
              <TracePaneRail
                side="left"
                icon={List}
                label="Trace list"
                onExpand={() => workspace.setLeftCollapsed(false)}
              />
            ) : (
              <TraceListPane
                items={traceList}
                selectedTraceId={selectedTraceId}
                onSelectTrace={handleTraceChange}
                search={traceSearch}
                onSearchChange={onTraceSearchChange}
                isLoading={listLoading}
                searchInputRef={traceListSearchRef}
                onCollapse={workspace.toggleLeftCollapsed}
                listEmptyAction={listEmptyAction}
                liveTraceId={data?.is_live ? normalized : null}
              />
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="trace-waterfall"
            defaultSize={workspace.defaultPanelSizes.center}
            minSize={35}
          >
            {centerContent}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            ref={rightPanelRef}
            id="trace-detail"
            defaultSize={workspace.defaultPanelSizes.right}
            minSize={18}
            maxSize={40}
            collapsible
            collapsedSize={TRACE_WORKSPACE_COLLAPSED_SIZE}
            onCollapse={() => workspace.setRightCollapsed(true)}
            onExpand={() => workspace.setRightCollapsed(false)}
          >
            {workspace.rightCollapsed ? (
              <TracePaneRail
                side="right"
                icon={PanelRight}
                label="Span details"
                onExpand={() => workspace.setRightCollapsed(false)}
              />
            ) : (
              <TraceSpanDetailsPane
                ref={detailPaneRef}
                traceId={normalized}
                data={data}
                waterfall={waterfall}
                selectedStep={detailStep}
                isPreview={Boolean(
                  inspector.inspectorEnabled &&
                    !inspector.inspectorLockedSpanId &&
                    detailStep &&
                    detailStep.id !== selectedStep?.id,
                )}
                isLoading={isLoading}
                onCollapse={workspace.toggleRightCollapsed}
                actionContext={spanActionContextExtras}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
