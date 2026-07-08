"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Copy, GitBranch, Loader2, Route } from "lucide-react";

import { RunExecutionGraph } from "@/components/mlops/run-execution-graph";
import { StatusBadge } from "@/components/mlops/status-badge";
import { TraceWaterfallView, otelTraceToWaterfall } from "@/components/mlops/trace-waterfall";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTraceDetail } from "@/hooks/use-trace-detail";
import { useAppContext } from "@/lib/app-context";
import type { TraceDetailAuditEvent, TraceDetailEvent, TraceDetailLog } from "@/lib/api";
import { normalizeTraceId } from "@/lib/trace-id";
import { cn, formatDateTimeCompact } from "@/lib/utils";

type TraceExplorerDialogProps = {
  traceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TimelineRow =
  | { source: "semantic"; id: string; ts: string; row: TraceDetailEvent }
  | { source: "audit"; id: string; ts: string; row: TraceDetailAuditEvent };

function statusFromValue(raw: string | null | undefined): "success" | "failed" | "running" | "pending" {
  const v = String(raw || "").toUpperCase();
  if (v.includes("FAIL") || v.includes("ERROR") || v.includes("CANCEL")) return "failed";
  if (v.includes("RUN") || v.includes("PROGRESS")) return "running";
  if (v.includes("PEND") || v.includes("QUEUE")) return "pending";
  if (v.includes("SUCCESS") || v.includes("COMPLETE")) return "success";
  return "pending";
}

function logLevelClass(level: string): string {
  const v = level.toUpperCase();
  if (v === "ERROR" || v === "CRITICAL") return "text-destructive";
  if (v === "WARN" || v === "WARNING") return "text-amber-600 dark:text-amber-400";
  if (v === "DEBUG") return "text-muted-foreground";
  return "text-foreground";
}

function PayloadCollapsible({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const text = JSON.stringify(payload, null, 2);
  if (!text || text === "{}") return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        Payload
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[10px] text-foreground">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SemanticEventCard({ ev }: { ev: TraceDetailEvent }) {
  return (
    <div className="panel-surface rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          semantic
        </span>
        <span className="text-sm font-medium text-foreground">{ev.type || "event"}</span>
        <StatusBadge status={statusFromValue(ev.status)} size="sm" />
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{formatDateTimeCompact(ev.ts)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {ev.run_id ? (
          <Link href={`/runs/${encodeURIComponent(ev.run_id)}`} className="link-primary font-mono">
            run {ev.run_id.slice(0, 8)}…
          </Link>
        ) : null}
        {ev.task_id ? <span className="font-mono">task {String(ev.task_id).slice(0, 8)}…</span> : null}
        {ev.dataset_id ? (
          <Link href={`/datasets/${encodeURIComponent(ev.dataset_id)}`} className="link-primary font-mono">
            dataset {ev.dataset_id.slice(0, 8)}…
          </Link>
        ) : null}
        {ev.model_id ? (
          <Link href={`/models/${encodeURIComponent(ev.model_id)}`} className="link-primary font-mono">
            model {ev.model_id.slice(0, 8)}…
          </Link>
        ) : null}
      </div>
      <PayloadCollapsible payload={ev.payload} />
    </div>
  );
}

function AuditEventCard({ ev }: { ev: TraceDetailAuditEvent }) {
  const status =
    typeof ev.payload?.status === "string"
      ? ev.payload.status
      : typeof ev.payload?.new_status === "string"
        ? ev.payload.new_status
        : null;
  return (
    <div className="panel-surface rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          audit
        </span>
        <span className="text-sm font-medium text-foreground">{ev.kind}</span>
        {status ? <StatusBadge status={statusFromValue(status)} size="sm" /> : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatDateTimeCompact(ev.ts)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {ev.resource_type} · <span className="font-mono">{ev.resource_id}</span>
        {ev.source ? ` · ${ev.source}` : null}
      </p>
      <PayloadCollapsible payload={ev.payload} />
    </div>
  );
}

function LogLine({ entry }: { entry: TraceDetailLog }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/50 py-1.5 font-mono text-xs last:border-b-0">
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTimeCompact(entry.ts)}</span>
      <span className={cn("w-12 shrink-0 font-semibold", logLevelClass(entry.level))}>{entry.level}</span>
      <span className="min-w-0 flex-1 break-words text-foreground">{entry.message}</span>
      {entry.task_id ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">task {String(entry.task_id).slice(0, 8)}…</span>
      ) : null}
    </div>
  );
}

export function TraceExplorerDialog({ traceId, open, onOpenChange }: TraceExplorerDialogProps) {
  const { tenantId, projectId, token } = useAppContext();
  const normalized = normalizeTraceId(traceId) || traceId.trim();
  const { data, isLoading, isError, error, refetch, isFetching } = useTraceDetail(
    tenantId,
    projectId,
    token,
    normalized,
    open,
  );

  const timelineRows = useMemo<TimelineRow[]>(() => {
    if (!data) return [];
    const semantic: TimelineRow[] = data.events.map((ev) => ({
      source: "semantic",
      id: ev.event_id,
      ts: ev.ts,
      row: ev,
    }));
    const audit: TimelineRow[] = (data.audit_events || []).map((ev, i) => ({
      source: "audit",
      id: `${ev.kind}-${ev.resource_id}-${i}`,
      ts: ev.ts || "",
      row: ev,
    }));
    return [...semantic, ...audit].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [data]);

  const otelWaterfall = useMemo(
    () => (data?.otel_trace ? otelTraceToWaterfall(data.otel_trace) : null),
    [data?.otel_trace],
  );

  const copyTraceId = async () => {
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="shrink-0 border-b border-border py-4 pl-6 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            Trace explorer
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
            <code className="break-all font-mono text-xs text-foreground">{normalized}</code>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copyTraceId()}>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </Button>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-6 py-4">
          {tenantId === "all" || projectId === "all" ? (
            <p className="text-sm text-muted-foreground">Pin tenant and project in the header to load trace details.</p>
          ) : isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading trace…
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">{String((error as Error)?.message || error)}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">No trace data found.</p>
          ) : (
            <Tabs defaultValue="timeline" className="flex min-h-0 flex-1 flex-col gap-4">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="timeline">Timeline ({timelineRows.length})</TabsTrigger>
                <TabsTrigger value="logs">Logs ({data.log_count ?? data.logs?.length ?? 0})</TabsTrigger>
                {data.waterfall ? <TabsTrigger value="waterfall">Waterfall</TabsTrigger> : null}
                {otelWaterfall ? (
                  <TabsTrigger value="spans">Spans ({data.otel_span_count ?? data.otel_trace?.span_count ?? 0})</TabsTrigger>
                ) : null}
                <TabsTrigger value="runs">Runs ({data.run_count})</TabsTrigger>
                {data.primary_run_id ? <TabsTrigger value="graph">Execution graph</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="timeline" className="space-y-3">
                {timelineRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded for this trace.</p>
                ) : (
                  timelineRows.map((row) =>
                    row.source === "semantic" ? (
                      <SemanticEventCard key={row.id} ev={row.row} />
                    ) : (
                      <AuditEventCard key={row.id} ev={row.row} />
                    ),
                  )
                )}
              </TabsContent>

              <TabsContent value="logs" className="space-y-2">
                {!data.logs?.length ? (
                  <p className="text-sm text-muted-foreground">No run logs found for linked runs.</p>
                ) : (
                  <div className="panel-surface rounded-lg border border-border p-3">
                    {data.logs.map((entry, i) => (
                      <LogLine key={`${entry.ts}-${entry.message}-${i}`} entry={entry} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {data.waterfall ? (
                <TabsContent value="waterfall" className="min-h-0">
                  <TraceWaterfallView waterfall={data.waterfall} variant="run" />
                </TabsContent>
              ) : null}

              {otelWaterfall ? (
                <TabsContent value="spans" className="min-h-0">
                  <TraceWaterfallView waterfall={otelWaterfall} variant="otel" />
                </TabsContent>
              ) : null}

              <TabsContent value="runs" className="space-y-3">
                {data.runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs linked to this trace.</p>
                ) : (
                  data.runs.map((run) => (
                    <div
                      key={run.run_id}
                      className={cn(
                        "panel-surface flex flex-wrap items-center gap-3 rounded-lg border border-border p-3",
                        run.run_id === data.primary_run_id && "ring-1 ring-primary/30",
                      )}
                    >
                      <GitBranch className="h-4 w-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-foreground">{run.run_id}</p>
                        <p className="text-xs text-muted-foreground">
                          pipeline {run.pipeline_id || "—"} · {formatDateTimeCompact(run.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={statusFromValue(run.status)} size="sm" />
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/runs/${encodeURIComponent(run.run_id)}`}>Open run</Link>
                      </Button>
                    </div>
                  ))
                )}
              </TabsContent>

              {data.primary_run_id ? (
                <TabsContent value="graph" className="min-h-0 flex-1">
                  <RunExecutionGraph
                    tenantId={tenantId}
                    projectId={projectId}
                    runId={data.primary_run_id}
                    token={token}
                    enabled
                    className="min-h-[min(50vh,28rem)]"
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TraceLinkProps = {
  traceId?: string | null;
  variant?: "button" | "link";
  size?: "sm" | "default";
  className?: string;
};

export function TraceLink({ traceId, variant = "button", size = "sm", className }: TraceLinkProps) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeTraceId(traceId);
  if (!normalized) return null;

  const label = `${normalized.slice(0, 8)}…`;

  if (variant === "link") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "link-primary inline-flex max-w-full min-w-0 items-center gap-1.5 whitespace-nowrap text-xs",
            className,
          )}
        >
          <Route className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate font-mono">{label}</span>
        </button>
        <TraceExplorerDialog traceId={normalized} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className={cn(
          "h-8 shrink-0 gap-1.5 whitespace-nowrap border-border bg-card px-2.5 text-xs text-primary",
          "hover:border-primary/40 hover:bg-primary/10",
          className,
        )}
      >
        <Route className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span>View trace</span>
      </Button>
      <TraceExplorerDialog traceId={normalized} open={open} onOpenChange={setOpen} />
    </>
  );
}
