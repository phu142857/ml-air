"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Copy, MoreHorizontal, PanelRightClose } from "lucide-react";

import { StatusBadge } from "@/components/mlops/status-badge";
import { TraceCrossLinks } from "@/components/mlops/trace-explorer/trace-cross-links";
import { TraceJsonViewer } from "@/components/mlops/trace-explorer/trace-json-viewer";
import { TraceSpanDropdownItems } from "@/components/mlops/trace-explorer/trace-span-actions";
import { buildSpanTimelineRows } from "@/components/mlops/trace-explorer/trace-span-events";
import {
  AuditEventCard,
  SemanticEventCard,
} from "@/components/mlops/trace-explorer/trace-secondary-panels";
import { formatWaterfallDuration } from "@/components/mlops/trace-waterfall";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TraceDetailResponse, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { copyWithToast } from "@/lib/toast-actions";
import { cn, formatDateTimeCompact } from "@/lib/utils";
import type { TraceSpanActionContext } from "@/components/mlops/trace-explorer/trace-span-actions";

type AttributeGroup = {
  id: string;
  title: string;
  entries: Array<{ key: string; value: string }>;
};

export type SpanDetailTab = "attributes" | "events" | "json";

const SPAN_DETAIL_TABS: Array<{ id: SpanDetailTab; label: string; shortcut: string }> = [
  { id: "attributes", label: "Attributes", shortcut: "1" },
  { id: "events", label: "Events", shortcut: "2" },
  { id: "json", label: "JSON", shortcut: "3" },
];

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

export function groupSpanAttributes(step: TraceWaterfallStep): AttributeGroup[] {
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

export function spanToJson(step: TraceWaterfallStep): Record<string, unknown> {
  return {
    id: step.id,
    kind: step.kind,
    label: step.label,
    status: step.status,
    service: step.service,
    plugin: step.plugin,
    source: step.source,
    run_id: step.run_id,
    task_id: step.task_id,
    span_id: step.span_id,
    start_ts: step.start_ts,
    end_ts: step.end_ts,
    duration_ms: step.duration_ms,
    offset_ms: step.offset_ms,
    width_ms: step.width_ms,
    end_offset_ms: step.end_offset_ms,
    is_instant: step.is_instant,
    depth: step.depth,
    attributes: step.attributes ?? {},
  };
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

function AttributesTab({ step }: { step: TraceWaterfallStep }) {
  const groups = groupSpanAttributes(step);

  return (
    <div className="space-y-4">
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
    </div>
  );
}

function EventsTab({ step, data }: { step: TraceWaterfallStep; data: TraceDetailResponse }) {
  const rows = useMemo(() => buildSpanTimelineRows(data, step), [data, step]);

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No events linked to this span.</p>;
  }

  return (
    <div className="space-y-3" role="list" aria-label="Span events">
      {rows.map((row) =>
        row.source === "semantic" ? (
          <SemanticEventCard key={row.id} ev={row.row} />
        ) : (
          <AuditEventCard key={row.id} ev={row.row} />
        ),
      )}
    </div>
  );
}

function JsonTab({ step }: { step: TraceWaterfallStep }) {
  return <TraceJsonViewer data={spanToJson(step)} />;
}

function SpanDetailsTabs({
  step,
  data,
  activeTab,
  onTabChange,
}: {
  step: TraceWaterfallStep;
  data: TraceDetailResponse;
  activeTab: SpanDetailTab;
  onTabChange: (tab: SpanDetailTab) => void;
}) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as SpanDetailTab)} className="min-h-0 flex-1">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card pb-2">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {SPAN_DETAIL_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-8 px-2.5 text-xs"
              aria-keyshortcuts={tab.shortcut}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="attributes" className="mt-0 px-0 py-4">
        <AttributesTab step={step} />
      </TabsContent>
      <TabsContent value="events" className="mt-0 px-0 py-4">
        <EventsTab step={step} data={data} />
      </TabsContent>
      <TabsContent value="json" className="mt-0 px-0 py-4">
        <JsonTab step={step} />
      </TabsContent>
    </Tabs>
  );
}

function TraceOverview({
  data,
  traceId,
  waterfall,
  onOpenLogsTab,
}: {
  data: TraceDetailResponse;
  traceId: string;
  waterfall: TraceWaterfall | null;
  onOpenLogsTab?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">Trace overview</h3>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{traceId}</p>
      </div>
      <TraceCrossLinks
        step={null}
        data={data}
        waterfall={waterfall}
        traceId={traceId}
        onOpenLogsTab={onOpenLogsTab}
      />
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
        Select a span or press ↑ ↓ to inspect. Press Enter to focus this panel.
      </p>
    </div>
  );
}

export type TraceSpanDetailsPaneHandle = {
  focusFirstInteractive: () => void;
};

export type TraceSpanDetailsPaneProps = {
  traceId: string;
  data: TraceDetailResponse | null | undefined;
  waterfall?: TraceWaterfall | null;
  selectedStep: TraceWaterfallStep | null;
  isPreview?: boolean;
  isLoading?: boolean;
  onCollapse?: () => void;
  onOpenLogsTab?: () => void;
  actionContext?: Omit<TraceSpanActionContext, "traceId" | "step" | "data" | "waterfall">;
};

export const TraceSpanDetailsPane = forwardRef<
  TraceSpanDetailsPaneHandle,
  TraceSpanDetailsPaneProps
>(function TraceSpanDetailsPane(
  {
    traceId,
    data,
    waterfall = null,
    selectedStep,
    isPreview = false,
    isLoading,
    onCollapse,
    onOpenLogsTab,
    actionContext,
  },
  ref,
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SpanDetailTab>("attributes");

  useEffect(() => {
    setActiveTab("attributes");
  }, [selectedStep?.id]);

  const resolvedActionContext = useMemo<TraceSpanActionContext>(
    () => ({
      traceId,
      step: selectedStep,
      data,
      waterfall,
      logsAvailable: Boolean((data?.log_count ?? 0) > 0),
      ...actionContext,
    }),
    [actionContext, data, selectedStep, traceId, waterfall],
  );

  const handleTabShortcut = useCallback(
    (digit: string) => {
      const tab = SPAN_DETAIL_TABS.find((item) => item.shortcut === digit);
      if (tab && selectedStep) setActiveTab(tab.id);
    },
    [selectedStep],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inDetail = Boolean(target?.closest('[data-trace-region="detail"]'));
      if (!inDetail || !selectedStep) return;
      if (event.key >= "1" && event.key <= "3" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        handleTabShortcut(event.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTabShortcut, selectedStep]);

  useImperativeHandle(ref, () => ({
    focusFirstInteractive: () => {
      const root = contentRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [role="tab"]',
      );
      focusable?.focus();
    },
  }));

  return (
    <div
      className="flex h-full min-h-0 flex-col border-l border-border bg-card"
      data-trace-region="detail"
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedStep
          ? isPreview
            ? `Previewing span ${selectedStep.label}, ${selectedStep.status}`
            : `Span details for ${selectedStep.label}, ${selectedStep.status}`
          : data
            ? "Trace overview"
            : ""}
      </div>
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              {isPreview ? "Span preview" : "Span details"}
            </h2>
            {selectedStep ? (
              <p className="truncate text-xs text-muted-foreground">
                {isPreview ? "Hover preview — click a span to lock" : selectedStep.label}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Span actions"
                  title="Span actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <TraceSpanDropdownItems {...resolvedActionContext} />
              </DropdownMenuContent>
            </DropdownMenu>
            {onCollapse ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-default hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={onCollapse}
                aria-label="Collapse detail panel"
                title="Collapse detail panel"
              >
                <PanelRightClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div ref={contentRef} className="scroll-region flex min-h-0 flex-1 flex-col px-4">
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading trace…</p>
        ) : !data ? (
          <p className="py-4 text-sm text-muted-foreground">Select a trace to load details.</p>
        ) : selectedStep ? (
          <SpanDetailsTabs
            step={selectedStep}
            data={data}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : (
          <div className="py-4">
            <TraceOverview
              data={data}
              traceId={traceId}
              waterfall={waterfall}
              onOpenLogsTab={onOpenLogsTab}
            />
          </div>
        )}
      </div>
    </div>
  );
});
