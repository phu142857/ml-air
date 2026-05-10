"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { getPipelineVersionDiff, listPipelineVersionsApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted p-2 font-mono text-xs text-foreground">
      {value === undefined || value === null ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DiffPageInner() {
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = decodeURIComponent(params.pipelineId);
  const sp = useSearchParams();
  const { tenantId, projectId, token } = useAppContext();
  const qLeft = sp.get("left") || "";
  const qRight = sp.get("right") || "";

  const listQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId),
    queryFn: () => listPipelineVersionsApi(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token)
  });
  const items = listQuery.data?.items ?? [];
  const [leftId, setLeftId] = useState(qLeft);
  const [rightId, setRightId] = useState(qRight);
  useEffect(() => {
    if (qLeft) setLeftId(qLeft);
    if (qRight) setRightId(qRight);
  }, [qLeft, qRight]);

  const canDiff = leftId && rightId && leftId !== rightId;
  const diffQuery = useQuery({
    queryKey: mlairKeys.pipelines.diff(tenantId, projectId, leftId, rightId),
    queryFn: () => getPipelineVersionDiff(tenantId, projectId, token, leftId, rightId),
    enabled: Boolean(canDiff && token)
  });

  const details = diffQuery.data?.details ?? [];
  const summary = useMemo(
    () => (diffQuery.data ? `${diffQuery.data.changed_keys.length} key(s) differ` : ""),
    [diffQuery.data]
  );

  return (
    <RouteShell
      activeNav="Pipelines"
      title={`Config diff · ${pipelineId}`}
      subtitle="Top-level keys from pipeline config JSONB"
    >
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`} className="text-foreground hover:underline">
          ← Versions
        </Link>
        <span className="text-muted-foreground">|</span>
        <Link href={`/pipelines/${encodeURIComponent(pipelineId)}`} className="text-muted-foreground hover:underline">
          DAG
        </Link>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Version selector</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-muted-foreground">
          Left
          <select
            className="ml-2 rounded-lg border border-border bg-muted px-2 py-1 text-foreground"
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
          >
            <option value="">—</option>
            {items.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                v{v.version} {v.version_id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted-foreground">
          Right
          <select
            className="ml-2 rounded-lg border border-border bg-muted px-2 py-1 text-foreground"
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
          >
            <option value="">—</option>
            {items.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                v{v.version} {v.version_id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
        </CardContent>
      </Card>
      {canDiff && (
        <p className="mb-2 text-sm text-amber-200/80">
          {diffQuery.isLoading ? "Loading diff…" : diffQuery.isError ? "Failed to load diff" : summary}
        </p>
      )}
      {!canDiff && <p className="text-sm text-muted-foreground">Select two different versions to compare.</p>}
      {canDiff && !diffQuery.isLoading && details.length > 0 && (
        <DataTableShell>
          <DataTable className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-1/4 px-3 py-2">Key</th>
                <th className="px-3 py-2">Left</th>
                <th className="px-3 py-2">Right</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="align-top font-mono text-xs text-foreground">{row.key}</td>
                  <td className="align-top p-2">
                    <JsonBlock value={row.left} />
                  </td>
                  <td className="align-top p-2">
                    <JsonBlock value={row.right} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </DataTableShell>
      )}
    </RouteShell>
  );
}

export default function PipelineDiffPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <DiffPageInner />
    </Suspense>
  );
}
