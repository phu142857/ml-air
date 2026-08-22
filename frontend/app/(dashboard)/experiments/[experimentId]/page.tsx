"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FlaskConical, Play } from "lucide-react";

import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import {
  DetailSection,
  MetadataGrid,
  MlopsEmptyState,
  ResourceDetailBreadcrumb,
  ResourcePageHeader,
  ScopePinnedInline,
} from "@/components/mlops/layout";
import { StatusBadge } from "@/components/mlops/status-badge";
import { useAppContext } from "@/lib/app-context";
import { fetchExperiment, fetchExperimentRunsPage, type RunItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { SCOPE_AGGREGATE_EXPERIMENT_DETAIL } from "@/lib/scope-messages";
import { isScopePinned } from "@/lib/scope";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { formatDateTimeCompact, formatRelativeTime } from "@/lib/utils";

const runColumns: DataTableColumn<RunItem>[] = [
  {
    id: "run_id",
    header: "Run",
    width: 280,
    getSearchValue: (r) => r.run_id,
    cell: (r) => (
      <Link href={`/runs/${encodeURIComponent(r.run_id)}`} className="font-mono text-xs hover:underline">
        {r.run_id}
      </Link>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: 120,
    getSortValue: (r) => r.status,
    cell: (r) => <StatusBadge value={r.status} />,
  },
  {
    id: "pipeline",
    header: "Pipeline",
    width: 200,
    getSearchValue: (r) => r.pipeline_id || "",
    cell: (r) => <span className="text-xs text-muted-foreground">{r.pipeline_id || "—"}</span>,
  },
  {
    id: "created",
    header: "Created",
    width: 160,
    getSortValue: (r) => r.created_at,
    cell: (r) => (
      <span className="text-xs text-muted-foreground">{formatRelativeTime(r.created_at)}</span>
    ),
  },
];

export default function ExperimentDetailPage() {
  const params = useParams();
  const experimentId = decodeURIComponent(String(params.experimentId || ""));
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const detailQuery = useQuery({
    queryKey: mlairKeys.experiments.detail(tenantId, projectId, experimentId),
    queryFn: () => fetchExperiment(tenantId, projectId, experimentId, token),
    enabled: scopePinned && Boolean(experimentId && token?.trim()),
    ...poll,
  });

  const runsQuery = useInfiniteQuery({
    queryKey: mlairKeys.experiments.runsInfinite(tenantId, projectId, experimentId),
    queryFn: ({ pageParam }) =>
      fetchExperimentRunsPage(tenantId, projectId, experimentId, token, {
        limit: 50,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: scopePinned && Boolean(experimentId && token?.trim()),
    ...poll,
  });

  const runs = runsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const exp = detailQuery.data;

  if (!scopePinned) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResourcePageHeader icon={FlaskConical} accent="violet" title="Experiment" />
        <ScopePinnedInline message={SCOPE_AGGREGATE_EXPERIMENT_DETAIL} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={FlaskConical}
        accent="violet"
        title={exp?.name || "Experiment"}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ResourceDetailBreadcrumb
          listHref="/experiments"
          listLabel="Experiments"
          currentLabel={exp?.name || experimentId}
        />

        {detailQuery.isLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : exp ? (
          <DetailSection title="Overview" className="mt-4">
            <MetadataGrid
              items={[
                { label: "Experiment ID", value: exp.experiment_id, mono: true },
                ...(exp.description ? [{ label: "Description", value: exp.description }] : []),
                { label: "Created", value: formatDateTimeCompact(exp.created_at) },
                { label: "Updated", value: formatDateTimeCompact(exp.updated_at) },
              ]}
            />
          </DetailSection>
        ) : null}

        <DetailSection title="Runs" className="mt-6">
          {runsQuery.isLoading ? (
            <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
          ) : runs.length === 0 ? (
            <MlopsEmptyState icon={Play} title="No runs" />
          ) : (
            <MlopsDataTable<RunItem> columns={runColumns} data={runs} keyExtractor={(r) => r.run_id} />
          )}
        </DetailSection>
      </div>
    </div>
  );
}
