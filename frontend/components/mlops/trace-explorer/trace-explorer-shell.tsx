"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { TraceExplorerWorkspace } from "@/components/mlops/trace-explorer/trace-explorer-workspace";
import {
  TraceEventsPanel,
  TraceExecutionGraphPanel,
  TraceLogsPanel,
  TraceRunsPanel,
  TraceServicesPanel,
  buildTraceTimelineRows,
} from "@/components/mlops/trace-explorer/trace-secondary-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTraceDetail } from "@/hooks/use-trace-detail";
import { useAppContext } from "@/lib/app-context";
import type { TraceSearchHit } from "@/lib/api";
import { normalizeTraceId } from "@/lib/trace-id";
import { cn } from "@/lib/utils";

export type TraceExplorerShellProps = {
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
  /** Rendered at the end of the tab bar (e.g. dialog close button). */
  headerAction?: ReactNode;
  className?: string;
};

export function TraceExplorerShell({
  traceList,
  selectedTraceId,
  onSelectTrace,
  traceSearch,
  onTraceSearchChange,
  listLoading,
  onOpenLogsTab,
  urlSpanId,
  urlZoom,
  urlQ,
  onUrlSpanChange,
  onUrlZoomChange,
  onUrlQChange,
  headerAction,
  className,
}: TraceExplorerShellProps) {
  const { tenantId, projectId, token } = useAppContext();
  const [activeTab, setActiveTab] = useState("spans");

  const normalized = selectedTraceId ? normalizeTraceId(selectedTraceId) || selectedTraceId.trim() : "";
  const detailEnabled = Boolean(normalized);

  const { data, isLoading, isError, error } = useTraceDetail(
    tenantId,
    projectId,
    token,
    normalized,
    detailEnabled,
  );

  const timelineCount = useMemo(() => (data ? buildTraceTimelineRows(data).length : 0), [data]);
  const logCount = data?.log_count ?? data?.logs?.length ?? 0;
  const runCount = data?.run_count ?? 0;
  const hasServiceGraph = Boolean(data?.service_graph?.nodes?.length);
  const hasExecutionGraph = Boolean(data?.primary_run_id);

  const scopeError =
    tenantId === "all" || projectId === "all"
      ? "Pin tenant and project in the header to load trace details."
      : isError
        ? String((error as Error)?.message || error)
        : null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-1">
        <TabsList className="h-auto min-w-0 flex-1 flex-wrap justify-start gap-0.5 border-0 bg-transparent p-0">
          <TabsTrigger
            value="spans"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Spans
          </TabsTrigger>
          <TabsTrigger
            value="events"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
            disabled={!detailEnabled || (!data && !isLoading)}
          >
            Events
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {timelineCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
            disabled={!detailEnabled || (!data && !isLoading)}
          >
            Logs
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {logCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="runs"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
            disabled={!detailEnabled || (!data && !isLoading)}
          >
            Runs
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {runCount}
            </span>
          </TabsTrigger>
          {hasServiceGraph ? (
            <TabsTrigger
              value="services"
              className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Services
            </TabsTrigger>
          ) : null}
          {hasExecutionGraph ? (
            <TabsTrigger
              value="graph"
              className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Execution graph
            </TabsTrigger>
          ) : null}
        </TabsList>
        {headerAction ? <div className="flex shrink-0 items-center">{headerAction}</div> : null}
      </div>

      <TabsContent value="spans" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <TraceExplorerWorkspace
          traceList={traceList}
          selectedTraceId={selectedTraceId}
          onSelectTrace={onSelectTrace}
          traceSearch={traceSearch}
          onTraceSearchChange={onTraceSearchChange}
          listLoading={listLoading}
          onOpenLogsTab={onOpenLogsTab ?? (() => setActiveTab("logs"))}
          urlSpanId={urlSpanId}
          urlZoom={urlZoom}
          urlQ={urlQ}
          onUrlSpanChange={onUrlSpanChange}
          onUrlZoomChange={onUrlZoomChange}
          onUrlQChange={onUrlQChange}
        />
      </TabsContent>

      <TabsContent
        value="events"
        className="scroll-region scroll-region-gutter mt-0 min-h-0 flex-1 px-4 py-4 data-[state=inactive]:hidden"
      >
        <TraceEventsPanel data={data} isLoading={isLoading} error={scopeError} />
      </TabsContent>

      <TabsContent
        value="logs"
        className="scroll-region scroll-region-gutter mt-0 min-h-0 flex-1 px-4 py-4 data-[state=inactive]:hidden"
      >
        <TraceLogsPanel data={data} isLoading={isLoading} error={scopeError} />
      </TabsContent>

      <TabsContent
        value="runs"
        className="scroll-region scroll-region-gutter mt-0 min-h-0 flex-1 px-4 py-4 data-[state=inactive]:hidden"
      >
        <TraceRunsPanel data={data} isLoading={isLoading} error={scopeError} />
      </TabsContent>

      {hasServiceGraph ? (
        <TabsContent
          value="services"
          className="scroll-region scroll-region-gutter mt-0 min-h-0 flex-1 px-4 py-4 data-[state=inactive]:hidden"
        >
          <TraceServicesPanel data={data} isLoading={isLoading} error={scopeError} />
        </TabsContent>
      ) : null}

      {hasExecutionGraph ? (
        <TabsContent
          value="graph"
          className="scroll-region scroll-region-gutter mt-0 min-h-0 flex-1 px-4 py-4 data-[state=inactive]:hidden"
        >
          <TraceExecutionGraphPanel
            data={data}
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            isLoading={isLoading}
            error={scopeError}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
