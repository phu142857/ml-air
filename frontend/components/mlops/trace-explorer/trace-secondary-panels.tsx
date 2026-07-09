"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Loader2 } from "lucide-react";

import { RunExecutionGraph } from "@/components/mlops/run-execution-graph";
import { StatusBadge } from "@/components/mlops/status-badge";
import { TraceServiceGraphView } from "@/components/mlops/trace-service-graph";
import { Button } from "@/components/ui/button";
import type {
  TraceDetailAuditEvent,
  TraceDetailEvent,
  TraceDetailLog,
  TraceDetailResponse,
} from "@/lib/api";
import { cn, formatDateTimeCompact } from "@/lib/utils";

export type TimelineRow =
  | { source: "semantic"; id: string; ts: string; row: TraceDetailEvent }
  | { source: "audit"; id: string; ts: string; row: TraceDetailAuditEvent };

export function buildTraceTimelineRows(data: TraceDetailResponse): TimelineRow[] {
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
}

function logLevelClass(level: string): string {
  const v = level.toUpperCase();
  if (v === "ERROR" || v === "CRITICAL") return "text-destructive";
  if (v === "WARN" || v === "WARNING") return "text-[color:var(--status-warning-fg)]";
  if (v === "DEBUG") return "text-muted-foreground";
  return "text-foreground";
}

function filteredPayload(payload: Record<string, unknown>, omitKeys: string[]): Record<string, unknown> {
  const out = { ...payload };
  for (const key of omitKeys) {
    delete out[key];
  }
  return out;
}

function payloadOmitKeysForSemantic(ev: TraceDetailEvent): string[] {
  const omit = ["task_id", "taskId"];
  if (ev.run_id) omit.push("run_id", "runId");
  if (ev.dataset_id) omit.push("dataset_id", "datasetId");
  if (ev.model_id) omit.push("model_id", "modelId");
  return omit;
}

function payloadOmitKeysForAudit(ev: TraceDetailAuditEvent): string[] {
  const rt = ev.resource_type.toLowerCase();
  const omit: string[] = [];
  if (rt === "task") omit.push("task_id", "taskId");
  if (rt === "run") omit.push("run_id", "runId");
  if (rt === "dataset" || rt === "dataset_version") {
    omit.push("dataset_id", "datasetId", "dataset_version_id");
  }
  if (rt === "model" || rt === "model_version") {
    omit.push("model_id", "modelId", "model_version_id");
  }
  return omit;
}

function hasPayload(payload: Record<string, unknown>): boolean {
  const text = JSON.stringify(payload, null, 2);
  return Boolean(text && text !== "{}");
}

function PayloadBlock({
  payload,
  omitKeys = [],
}: {
  payload: Record<string, unknown>;
  omitKeys?: string[];
}) {
  const filtered = filteredPayload(payload, omitKeys);
  const text = JSON.stringify(filtered, null, 2);
  if (!text || text === "{}") return null;
  return (
    <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted p-2 font-mono text-[10px] text-foreground">
      {text}
    </pre>
  );
}

function semanticExpandedContent(ev: TraceDetailEvent): boolean {
  const omit = payloadOmitKeysForSemantic(ev);
  return (
    Boolean(ev.run_id || ev.dataset_id || ev.model_id) ||
    hasPayload(filteredPayload(ev.payload, omit))
  );
}

function SemanticEventCard({ ev }: { ev: TraceDetailEvent }) {
  const [expanded, setExpanded] = useState(false);
  const omitKeys = payloadOmitKeysForSemantic(ev);
  const expandable = semanticExpandedContent(ev);

  return (
    <div className="panel-surface overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2 p-3 text-left transition-default",
          expandable && "cursor-pointer hover:bg-muted/50",
        )}
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-border bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              semantic
            </span>
            <span className="text-sm font-medium text-foreground">{ev.type || "event"}</span>
            <StatusBadge value={ev.status} size="sm" />
            <span className="ml-auto font-mono text-[10px] text-muted-foreground sm:ml-0">
              {formatDateTimeCompact(ev.ts)}
            </span>
          </div>
        </div>
        {expandable ? (
          expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-border p-3">
          {ev.run_id || ev.dataset_id || ev.model_id ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {ev.run_id ? (
                <Link href={`/runs/${encodeURIComponent(ev.run_id)}`} className="link-primary font-mono">
                  run {ev.run_id.slice(0, 8)}…
                </Link>
              ) : null}
              {ev.dataset_id ? (
                <Link
                  href={`/datasets/${encodeURIComponent(ev.dataset_id)}`}
                  className="link-primary font-mono"
                >
                  dataset {ev.dataset_id.slice(0, 8)}…
                </Link>
              ) : null}
              {ev.model_id ? (
                <Link href={`/models/${encodeURIComponent(ev.model_id)}`} className="link-primary font-mono">
                  model {ev.model_id.slice(0, 8)}…
                </Link>
              ) : null}
            </div>
          ) : null}
          <PayloadBlock payload={ev.payload} omitKeys={omitKeys} />
        </div>
      ) : null}
    </div>
  );
}

function AuditEventCard({ ev }: { ev: TraceDetailAuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const omitKeys = payloadOmitKeysForAudit(ev);
  const expandable = hasPayload(filteredPayload(ev.payload, omitKeys));
  const status =
    typeof ev.payload?.status === "string"
      ? ev.payload.status
      : typeof ev.payload?.new_status === "string"
        ? ev.payload.new_status
        : null;

  return (
    <div className="panel-surface overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2 p-3 text-left transition-default",
          expandable && "cursor-pointer hover:bg-muted/50",
        )}
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-border bg-[color:var(--status-warning-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--status-warning-fg)]">
              audit
            </span>
            <span className="text-sm font-medium text-foreground">{ev.kind}</span>
            {status ? <StatusBadge value={status} size="sm" /> : null}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground sm:ml-0">
              {formatDateTimeCompact(ev.ts)}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {ev.resource_type} · <span className="font-mono">{ev.resource_id}</span>
            {ev.source ? ` · ${ev.source}` : null}
          </p>
        </div>
        {expandable ? (
          expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}
      </button>
      {expanded ? (
        <div className="border-t border-border p-3">
          <PayloadBlock payload={ev.payload} omitKeys={omitKeys} />
        </div>
      ) : null}
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
        <span className="shrink-0 text-[10px] text-muted-foreground">
          task {String(entry.task_id).slice(0, 8)}…
        </span>
      ) : null}
    </div>
  );
}

type PanelShellProps = {
  isLoading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage: string;
  children: ReactNode;
};

function PanelShell({ isLoading, error, empty, emptyMessage, children }: PanelShellProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error) {
    return <p className="py-8 text-sm text-destructive">{error}</p>;
  }
  if (empty) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return <>{children}</>;
}

export function TraceEventsPanel({
  data,
  isLoading,
  error,
}: {
  data: TraceDetailResponse | null | undefined;
  isLoading?: boolean;
  error?: string | null;
}) {
  const rows = useMemo(() => (data ? buildTraceTimelineRows(data) : []), [data]);

  return (
    <PanelShell
      isLoading={isLoading}
      error={error}
      empty={!rows.length}
      emptyMessage="No events recorded for this trace."
    >
      <div className="space-y-3" role="list" aria-label="Trace events">
        {rows.map((row) =>
          row.source === "semantic" ? (
            <SemanticEventCard key={row.id} ev={row.row} />
          ) : (
            <AuditEventCard key={row.id} ev={row.row} />
          ),
        )}
      </div>
    </PanelShell>
  );
}

export function TraceLogsPanel({
  data,
  isLoading,
  error,
}: {
  data: TraceDetailResponse | null | undefined;
  isLoading?: boolean;
  error?: string | null;
}) {
  const logs = data?.logs ?? [];

  return (
    <PanelShell
      isLoading={isLoading}
      error={error}
      empty={!logs.length}
      emptyMessage="No run logs found for this trace."
    >
      <div className="panel-surface rounded-lg border border-border p-3" role="log" aria-label="Trace logs">
        {logs.map((entry, i) => (
          <LogLine key={`${entry.ts}-${entry.message}-${i}`} entry={entry} />
        ))}
      </div>
    </PanelShell>
  );
}

export function TraceRunsPanel({
  data,
  isLoading,
  error,
}: {
  data: TraceDetailResponse | null | undefined;
  isLoading?: boolean;
  error?: string | null;
}) {
  const runs = data?.runs ?? [];

  return (
    <PanelShell
      isLoading={isLoading}
      error={error}
      empty={!runs.length}
      emptyMessage="No runs linked to this trace."
    >
      <div className="space-y-3" role="list" aria-label="Linked runs">
        {runs.map((run) => (
          <div
            key={run.run_id}
            className={cn(
              "panel-surface flex flex-wrap items-center gap-3 rounded-lg border border-border p-3",
              run.run_id === data?.primary_run_id && "border-primary/40 bg-primary/5",
            )}
          >
            <GitBranch className="h-4 w-4 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm text-foreground">{run.run_id}</p>
              <p className="text-xs text-muted-foreground">
                pipeline {run.pipeline_id || "—"} · {formatDateTimeCompact(run.created_at)}
              </p>
            </div>
            <StatusBadge value={run.status} size="sm" />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/runs/${encodeURIComponent(run.run_id)}`}>Open run</Link>
            </Button>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

export function TraceServicesPanel({
  data,
  isLoading,
  error,
}: {
  data: TraceDetailResponse | null | undefined;
  isLoading?: boolean;
  error?: string | null;
}) {
  const graph = data?.service_graph;
  const hasNodes = Boolean(graph?.nodes?.length);

  return (
    <PanelShell
      isLoading={isLoading}
      error={error}
      empty={!hasNodes}
      emptyMessage="No service dependencies recorded for this trace."
    >
      <TraceServiceGraphView graph={graph} />
    </PanelShell>
  );
}

export function TraceExecutionGraphPanel({
  data,
  tenantId,
  projectId,
  token,
  isLoading,
  error,
}: {
  data: TraceDetailResponse | null | undefined;
  tenantId: string;
  projectId: string;
  token: string;
  isLoading?: boolean;
  error?: string | null;
}) {
  const runId = data?.primary_run_id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error) {
    return <p className="py-8 text-sm text-destructive">{error}</p>;
  }
  if (!runId) {
    return <p className="py-8 text-sm text-muted-foreground">No primary run for execution graph.</p>;
  }

  return (
    <RunExecutionGraph
      tenantId={tenantId}
      projectId={projectId}
      runId={runId}
      token={token}
      enabled
      className="min-h-[min(50vh,28rem)]"
    />
  );
}
