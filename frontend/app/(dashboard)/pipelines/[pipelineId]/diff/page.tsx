"use client";

import { Suspense, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FileDiff, Copy } from "lucide-react";
import { getPipelineVersionDiff, listPipelineVersionsApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import {
  DetailSection,
  MlopsEmptyState,
  MlopsPageError,
  MlopsPageLoading,
  PageScrollBody,
  ResourceDetailBreadcrumb,
  ResourcePageHeader,
  ScopePinnedInline,
  pageHeaderActionClass,
} from "@/components/mlops/layout";
import { copyWithToast } from "@/lib/toast-actions";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINE_DETAIL } from "@/lib/scope-messages";
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { cn } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";

const sectionClass = "w-full";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto inset-surface p-2 font-mono text-xs text-foreground/90">
      {value === undefined || value === null ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DiffPageInner() {
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = decodeURIComponent(params.pipelineId);
  const sp = useSearchParams();
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qLeft = sp.get("left") || "";
  const qRight = sp.get("right") || "";

  const listQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId),
    queryFn: () => listPipelineVersionsApi(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token)
  });
  const items = listQuery.data?.items ?? [];
  const versionPickOptions = useMemo(
    () =>
      items.map((v) => ({
        value: v.version_id,
        label: `${formatVersionLabel(v.version)} · ${v.version_id.slice(0, 8)}…`,
      })),
    [items],
  );
  const [leftId, setLeftId] = useState(qLeft);
  const [rightId, setRightId] = useState(qRight);
  useEffect(() => {
    if (qLeft) setLeftId(qLeft);
    if (qRight) setRightId(qRight);
  }, [qLeft, qRight]);

  useEffect(() => {
    if (!items.length || qLeft || qRight) return;
    const sorted = [...items].sort((a, b) => b.version - a.version);
    if (sorted[0]) setRightId(sorted[0].version_id);
    if (sorted[1]) setLeftId(sorted[1].version_id);
  }, [items, qLeft, qRight]);

  const canDiff = leftId && rightId && leftId !== rightId;
  const diffQuery = useQuery({
    queryKey: mlairKeys.pipelines.diff(tenantId, projectId, leftId, rightId),
    queryFn: () => getPipelineVersionDiff(tenantId, projectId, token, leftId, rightId),
    enabled: Boolean(canDiff && token)
  });

  type DiffRow = { key: string; left: unknown; right: unknown }
  const details = (diffQuery.data?.details ?? []) as DiffRow[]
  const summary = useMemo(
    () => (diffQuery.data ? `${diffQuery.data.changed_keys.length} key(s) differ` : ""),
    [diffQuery.data]
  )

  const diffColumns: DataTableColumn<DiffRow>[] = useMemo(
    () => [
      {
        id: "key",
        header: "Key",
        width: 260,
        canHide: false,
        getSearchValue: (row) => row.key,
        getSortValue: (row) => row.key,
        cell: (row) => <span className="font-mono text-xs text-[color:var(--status-pending-fg)]/90">{row.key}</span>,
      },
      {
        id: "left",
        header: "Left",
        width: 360,
        wrap: true,
        cell: (row) => <JsonBlock value={row.left} />,
      },
      {
        id: "right",
        header: "Right",
        width: 360,
        wrap: true,
        cell: (row) => <JsonBlock value={row.right} />,
      },
    ],
    [],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/70 bg-background/60 overflow-hidden">
        <ResourceDetailBreadcrumb
          listHref="/pipelines"
          listLabel="Pipelines"
          currentLabel="Config diff"
          middleSegments={[
            {
              label: pipelineId,
              href: `/pipelines/${encodeURIComponent(pipelineId)}`,
              mono: true,
            },
            {
              label: "Versions",
              href: `/pipelines/${encodeURIComponent(pipelineId)}/versions`,
            },
          ]}
        />
        <ResourcePageHeader
          icon={FileDiff}
          accent="zinc"
          title="Config diff"
          className="border-b-0"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={pageHeaderActionClass}
                onClick={() => void copyWithToast(pipelineId, { successTitle: "Pipeline ID copied" })}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy ID
              </Button>
              <Button variant="outline" size="sm" className={pageHeaderActionClass} asChild>
                <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}>Versions</Link>
              </Button>
            <Button variant="outline" size="sm" className={pageHeaderActionClass} asChild>
              <Link href={`/pipelines/${encodeURIComponent(pipelineId)}`}>DAG</Link>
            </Button>
          </div>
        }
      />
      </div>
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINE_DETAIL} /> : null}
      >
        <DetailSection
          title="Version selector"
          accentBorder="amber"
          className={cn(sectionClass, "overflow-visible")}
          bodyClassName="overflow-visible"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-muted-foreground">
              Left (older)
              <SelectDropdown
                value={leftId}
                onChange={setLeftId}
                options={versionPickOptions}
                className="mt-1"
                disabled={!versionPickOptions.length}
                placeholder={listQuery.isLoading ? "Loading…" : "No versions"}
                buttonClassName="inset-surface px-2 py-1.5 text-sm text-foreground"
                aria-label="Left version for diff"
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Right (newer)
              <SelectDropdown
                value={rightId}
                onChange={setRightId}
                options={versionPickOptions}
                className="mt-1"
                disabled={!versionPickOptions.length}
                placeholder={listQuery.isLoading ? "Loading…" : "No versions"}
                buttonClassName="inset-surface px-2 py-1.5 text-sm text-foreground"
                aria-label="Right version for diff"
              />
            </label>
          </div>
        </DetailSection>
        {canDiff ? (
          <p className="text-sm text-[color:var(--status-pending-fg)] dark:text-[color:var(--status-pending-fg)]/90">
            {diffQuery.isLoading ? "Loading diff…" : diffQuery.isError ? "Failed to load diff" : summary}
          </p>
        ) : null}
        {!canDiff ? (
          <p className="text-sm text-muted-foreground">Select two different versions to compare.</p>
        ) : diffQuery.isLoading ? (
          <MlopsPageLoading label="Loading diff…" minHeight="10rem" />
        ) : diffQuery.isError ? (
          <MlopsPageError
            title="Failed to load diff"
            message="Could not compare the selected versions."
            onRetry={() => void diffQuery.refetch()}
          />
        ) : details.length === 0 ? (
          <MlopsEmptyState icon={FileDiff} title="No differences" />
        ) : (
          <DetailSection title="Changed keys" accentBorder="amber" bodyClassName="p-0">
            <DataTable
              tableId={`pipeline-diff:${pipelineId}`}
              columns={diffColumns}
              data={details}
              keyExtractor={(row) => row.key}
              emptyMessage="No diff rows."
              className="border-0 rounded-none"
            />
          </DetailSection>
        )}
      </PageScrollBody>
    </div>
  );
}

export default function PipelineDiffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <MlopsPageLoading label="Loading diff page…" minHeight="12rem" />
        </div>
      }
    >
      <DiffPageInner />
    </Suspense>
  );
}
