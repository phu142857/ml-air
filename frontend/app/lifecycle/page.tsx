"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { fetchRuns, type RunItem } from "@/lib/api";
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

export default function LifecycleInsightsPage() {
  const { tenantId, projectId, token } = useAppContext();

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
      subtitle="MVP hub for dataset → version → readiness → train → model — deeper timelines and filters ship incrementally (see ROADMAP Phase 4)."
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
            Full history and compare tools live on <Link href="/runs" className="text-primary underline-offset-4 hover:underline">Runs</Link>.
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
