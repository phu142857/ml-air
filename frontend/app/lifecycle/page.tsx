"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RouteShell } from "@/components/layout/route-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAuditTimeline, fetchRuns, type AuditTimelineItem, type RunItem } from "@/lib/api";
import type { AuditTimelineFilters } from "@/lib/audit-timeline-filters";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";
import { formatDateTimeCompact } from "@/lib/utils";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";

function pinnedDatasetVersionId(row: RunItem): string {
  const o = row.override_config;
  if (!o || typeof o !== "object") return "—";
  const v = (o as Record<string, unknown>).dataset_version_id;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function hrefForTimelineRow(row: AuditTimelineItem): string | null {
  const rt = row.resource_type;
  const id = row.resource_id;
  if (!id) return null;
  if (rt === "dataset") return `/datasets/${encodeURIComponent(id)}`;
  if (rt === "model") return `/models/${encodeURIComponent(id)}`;
  if (rt === "run") return `/runs/${encodeURIComponent(id)}`;
  if (rt === "task") {
    const p = row.payload;
    const runId = p && typeof p === "object" && typeof (p as Record<string, unknown>).run_id === "string" ? String((p as Record<string, unknown>).run_id) : "";
    return runId ? `/runs/${encodeURIComponent(runId)}` : null;
  }
  return null;
}

const SELECT_FIELD =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type TimelineDraft = {
  modelId: string;
  policyId: string;
  datasetVersionId: string;
  readinessStatus: string;
  kind: string;
  source: string;
};

const emptyTimelineDraft: TimelineDraft = {
  modelId: "",
  policyId: "",
  datasetVersionId: "",
  readinessStatus: "",
  kind: "",
  source: ""
};

function draftToAppliedTimeline(d: TimelineDraft): AuditTimelineFilters {
  const f: AuditTimelineFilters = {};
  const mid = d.modelId.trim();
  if (mid) {
    f.resourceType = "model";
    f.resourceId = mid;
  }
  if (d.policyId.trim()) f.policyId = d.policyId.trim();
  if (d.datasetVersionId.trim()) f.datasetVersionId = d.datasetVersionId.trim();
  if (d.readinessStatus.trim()) f.readinessStatus = d.readinessStatus.trim();
  if (d.kind.trim()) f.kind = d.kind.trim();
  if (d.source.trim()) f.source = d.source.trim();
  return f;
}

const LINKS: Array<{ href: string; title: string; body: string }> = [
  {
    href: "/datasets",
    title: "Dataset Hub",
    body: "Versions, accumulation / materialization, readiness, eligibility, train-from-version."
  },
  {
    href: "/models",
    title: "Models",
    body: "Registry, approvals, promotion, serving — governance next to data lifecycle."
  },
  {
    href: "/runs",
    title: "Runs",
    body: "Execution state, readiness snapshot on run, DLQ / replay for recovery."
  },
  {
    href: "/lineage",
    title: "Lineage",
    body: "Semantic traceability across runs, datasets, and versions (debug / audit)."
  }
];

function hasTimelineFilters(f: AuditTimelineFilters): boolean {
  return Object.values(f).some((v) => typeof v === "string" && v.trim() !== "");
}

export default function LifecycleInsightsPage() {
  const { tenantId, projectId, token } = useAppContext();
  const scopeOk = Boolean(tenantId && projectId && tenantId !== "all" && projectId !== "all");
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft>(emptyTimelineDraft);
  const [appliedTimelineFilters, setAppliedTimelineFilters] = useState<AuditTimelineFilters>({});

  const timelineLimit = hasTimelineFilters(appliedTimelineFilters) ? 50 : 25;

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, appliedTimelineFilters),
    queryFn: () =>
      fetchAuditTimeline(tenantId, projectId, token, { limit: timelineLimit, filters: appliedTimelineFilters }),
    enabled: scopeOk,
    ...realtimeFallbackPolling()
  });

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });

  const recentRuns = (runsData?.items ?? []).slice(0, 12);

  return (
    <RouteShell
      activeNav="Lifecycle"
      title="Lifecycle insights"
      subtitle="MVP hub for dataset → version → readiness → train → model — audit timeline below supports semantic filters aligned with the API (see ROADMAP Phase 4)."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.body}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Open →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle>Audit timeline</CardTitle>
          <CardDescription>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">GET .../audit/timeline</code> — readiness evaluations, model version / serving events, run and task snapshots (limit {timelineLimit}). Optional filters map to server query params; policy / version / readiness status apply to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">dataset.readiness.evaluated</code> rows. Refreshes with the same realtime / polling cadence as Runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!scopeOk ? (
            <p className="text-sm text-muted-foreground">Select a single tenant and project to load the timeline.</p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tl-model">Model id</Label>
                  <Input
                    id="tl-model"
                    placeholder="registry model_id"
                    value={timelineDraft.modelId}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, modelId: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tl-policy">Policy id</Label>
                  <Input
                    id="tl-policy"
                    placeholder="readiness payload policy_id"
                    value={timelineDraft.policyId}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, policyId: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tl-dv">Dataset version id</Label>
                  <Input
                    id="tl-dv"
                    placeholder="readiness payload dataset_version_id"
                    value={timelineDraft.datasetVersionId}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, datasetVersionId: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tl-st">Readiness status</Label>
                  <select
                    id="tl-st"
                    className={SELECT_FIELD}
                    value={timelineDraft.readinessStatus}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, readinessStatus: e.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="eligible">eligible</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tl-kind">Kind (exact)</Label>
                  <Input
                    id="tl-kind"
                    placeholder="e.g. run.updated"
                    value={timelineDraft.kind}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, kind: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tl-src">Source</Label>
                  <Input
                    id="tl-src"
                    placeholder="readiness evaluation source"
                    value={timelineDraft.source}
                    onChange={(e) => setTimelineDraft((d) => ({ ...d, source: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAppliedTimelineFilters(draftToAppliedTimeline(timelineDraft))}
                >
                  Apply filters
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTimelineDraft(emptyTimelineDraft);
                    setAppliedTimelineFilters({});
                  }}
                >
                  Clear
                </Button>
              </div>
              {auditLoading ? (
                <p className="text-sm text-muted-foreground">Loading timeline…</p>
              ) : (auditData?.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {hasTimelineFilters(appliedTimelineFilters)
                    ? "No timeline rows match these filters."
                    : "No timeline rows in this scope yet."}
                </p>
              ) : (
                <DataTableShell>
              <DataTable className="text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Kind</th>
                    <th className="px-3 py-2 text-left">Resource</th>
                    <th className="px-3 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditData?.items ?? []).map((row, idx) => {
                    const href = hrefForTimelineRow(row);
                    const label = `${row.resource_type}:${row.resource_id}`;
                    return (
                      <tr key={`${row.ts}-${row.kind}-${row.resource_id}-${idx}`} className="border-t border-border">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTimeCompact(row.ts ?? undefined)}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs" title={row.kind}>
                          {row.kind}
                        </td>
                        <td className="max-w-[16rem] truncate px-3 py-2 text-xs" title={label}>
                          {href ? (
                            <Link href={href} className="text-primary underline-offset-4 hover:underline">
                              {label}
                            </Link>
                          ) : (
                            label
                          )}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-xs">{row.source ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </DataTableShell>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>
            Latest activity in the current scope, with the pinned <code className="rounded bg-muted px-1 py-0.5 text-xs">dataset_version_id</code> from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">override_config</code> when present (strict train-from-version flows).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <p className="text-sm text-muted-foreground">Loading runs…</p>
          ) : recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs in this scope yet. Open Runs to start a pipeline.</p>
          ) : (
            <DataTableShell>
              <DataTable className="text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Run</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Pinned version</th>
                    <th className="px-3 py-2 text-left">Pipeline</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((row) => (
                    <tr key={row.run_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link href={`/runs/${row.run_id}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
                          {row.run_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                        >
                          {normalizeStatus(row.status)}
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs" title={pinnedDatasetVersionId(row)}>
                        {pinnedDatasetVersionId(row)}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-xs" title={row.pipeline_id}>
                        {row.pipeline_id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTimeCompact(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </DataTableShell>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Full history and compare tools live on <Link href="/runs" className="text-primary underline-offset-4 hover:underline">Runs</Link>. For a downloadable audit feed (readiness evals, model events, run snapshots), use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">GET .../audit/timeline/export?format=jsonl</code> — see API overview.
          </p>
        </CardContent>
      </Card>

      <p className="text-body text-muted-foreground">
        Realtime semantic events (for example <code className="rounded bg-muted px-1.5 py-0.5 text-xs">buffer.threshold_met</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">training.triggered</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">eligibility.updated</code>) refresh Hub queries automatically when the WebSocket is configured.
      </p>
    </RouteShell>
  );
}
