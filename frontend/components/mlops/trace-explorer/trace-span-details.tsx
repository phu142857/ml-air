"use client";

import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";

import { StatusBadge } from "@/components/mlops/status-badge";
import { Button } from "@/components/ui/button";
import { formatWaterfallDuration } from "@/components/mlops/trace-waterfall";
import type { TraceDetailResponse, TraceWaterfallStep } from "@/lib/api";
import { copyWithToast } from "@/lib/toast-actions";
import { cn, formatDateTimeCompact } from "@/lib/utils";

type AttributeGroup = {
  id: string;
  title: string;
  entries: Array<{ key: string; value: string }>;
};

function stringifyValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function groupSpanAttributes(step: TraceWaterfallStep): AttributeGroup[] {
  const groups: AttributeGroup[] = [];

  const identity: Array<{ key: string; value: string }> = [
    { key: "Span ID", value: step.id },
    { key: "Kind", value: step.kind },
  ];
  if (step.span_id) identity.push({ key: "OTLP span", value: step.span_id });
  if (step.source) identity.push({ key: "Source", value: step.source });
  groups.push({ id: "identity", title: "Identity", entries: identity });

  const resource: Array<{ key: string; value: string }> = [];
  if (step.service) resource.push({ key: "Service", value: step.service });
  if (step.plugin) resource.push({ key: "Plugin", value: step.plugin });
  if (step.run_id) resource.push({ key: "Run ID", value: step.run_id });
  if (step.task_id) resource.push({ key: "Task ID", value: step.task_id });
  if (resource.length) groups.push({ id: "resource", title: "Resource", entries: resource });

  groups.push({
    id: "timing",
    title: "Timing",
    entries: [
      { key: "Start", value: step.start_ts ? formatDateTimeCompact(step.start_ts) : "—" },
      { key: "End", value: step.end_ts ? formatDateTimeCompact(step.end_ts) : "—" },
      {
        key: "Duration",
        value: step.is_instant
          ? "Instant"
          : formatWaterfallDuration(step.duration_ms ?? step.width_ms),
      },
      { key: "Offset", value: formatWaterfallDuration(step.offset_ms) },
    ],
  });

  groups.push({
    id: "status",
    title: "Status",
    entries: [{ key: "State", value: step.status }],
  });

  const attrs = step.attributes ?? {};
  const attrEntries = Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value: stringifyValue(value) }));
  if (attrEntries.length) {
    groups.push({ id: "attributes", title: "Attributes", entries: attrEntries });
  }

  return groups;
}

function CopyableRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const copy = () =>
    void copyWithToast(value, {
      successTitle: "Copied",
      successDescription: label,
    });

  return (
    <div className="flex items-start justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className={cn("mt-0.5 break-all text-sm text-foreground", mono && "font-mono text-xs")}>
          {value}
        </dd>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function SpanDetails({ step }: { step: TraceWaterfallStep }) {
  const groups = groupSpanAttributes(step);
  const href =
    step.kind === "run"
      ? `/runs/${encodeURIComponent(step.id)}`
      : step.kind === "task"
        ? `/tasks/${encodeURIComponent(step.id)}`
        : null;

  const jsonText = JSON.stringify(
    {
      id: step.id,
      kind: step.kind,
      label: step.label,
      status: step.status,
      service: step.service,
      plugin: step.plugin,
      start_ts: step.start_ts,
      end_ts: step.end_ts,
      duration_ms: step.duration_ms,
      attributes: step.attributes ?? {},
    },
    null,
    2,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {step.label}
          </h3>
          <StatusBadge value={step.status} size="sm" />
        </div>
        {href ? (
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href={href}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open {step.kind}
            </Link>
          </Button>
        ) : null}
      </div>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`span-group-${group.id}`}>
          <h4
            id={`span-group-${group.id}`}
            className="mb-1 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {group.title}
          </h4>
          <dl className="divide-y divide-border">
            {group.entries.map((entry) => (
              <CopyableRow
                key={`${group.id}-${entry.key}`}
                label={entry.key}
                value={entry.value}
                mono={entry.key.toLowerCase().includes("id")}
              />
            ))}
          </dl>
        </section>
      ))}

      <section aria-labelledby="span-json-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4
            id="span-json-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            JSON
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              void copyWithToast(jsonText, {
                successTitle: "Span JSON copied",
              })
            }
          >
            <Copy className="h-3 w-3" />
            Copy JSON
          </Button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
          {jsonText}
        </pre>
      </section>
    </div>
  );
}

function TraceOverview({ data, traceId }: { data: TraceDetailResponse; traceId: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">Trace overview</h3>
        <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{traceId}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Runs</dt>
          <dd className="mt-1 font-semibold tabular-nums">{data.run_count}</dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Spans</dt>
          <dd className="mt-1 font-semibold tabular-nums">{data.unified_step_count ?? 0}</dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Events</dt>
          <dd className="mt-1 font-semibold tabular-nums">{data.event_count}</dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Logs</dt>
          <dd className="mt-1 font-semibold tabular-nums">{data.log_count}</dd>
        </div>
      </dl>
      {data.is_live ? (
        <StatusBadge status="running" label="Live trace" size="sm" />
      ) : null}
      <p className="text-xs text-muted-foreground">
        Select a span in the waterfall to inspect metadata, tags, and JSON.
      </p>
    </div>
  );
}

export type TraceSpanDetailsPaneProps = {
  traceId: string;
  data: TraceDetailResponse | null | undefined;
  selectedStep: TraceWaterfallStep | null;
  isLoading?: boolean;
};

export function TraceSpanDetailsPane({
  traceId,
  data,
  selectedStep,
  isLoading,
}: TraceSpanDetailsPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedStep
          ? `Span details for ${selectedStep.label}, ${selectedStep.status}`
          : data
            ? "Trace overview"
            : ""}
      </div>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">Span details</h2>
      </div>
      <div className="scroll-region min-h-0 flex-1 px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading trace…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Select a trace to load details.</p>
        ) : selectedStep ? (
          <SpanDetails step={selectedStep} />
        ) : (
          <TraceOverview data={data} traceId={traceId} />
        )}
      </div>
    </div>
  );
}
