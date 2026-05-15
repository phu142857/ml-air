"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FileDiff } from "lucide-react";
import { getPipelineVersionDiff, listPipelineVersionsApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { ResourcePageHeader } from "@/components/layout/page-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { SelectDropdown } from "@/components/ui/select-dropdown";

const cardClass = "border-zinc-800 bg-zinc-900/50";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
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
  const versionPickOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...items.map((v) => ({
        value: v.version_id,
        label: `v${v.version} ${v.version_id.slice(0, 8)}…`
      }))
    ],
    [items]
  );
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
    <div className="flex h-full flex-col">
      <ResourcePageHeader
        icon={FileDiff}
        accent="amber"
        title="Config diff"
        subtitle={`${pipelineId} · top-level keys from pipeline config JSONB`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}
              className="text-sky-400 hover:text-sky-300 hover:underline"
            >
              ← Versions
            </Link>
            <span className="text-zinc-600">|</span>
            <Link
              href={`/pipelines/${encodeURIComponent(pipelineId)}`}
              className="text-zinc-500 hover:text-zinc-300 hover:underline"
            >
              DAG
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <Card className={`mb-6 ${cardClass}`}>
          <CardHeader>
            <CardTitle className="text-zinc-200">Version selector</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              Left
              <SelectDropdown
                value={leftId}
                onChange={setLeftId}
                options={versionPickOptions}
                buttonClassName="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                aria-label="Left version for diff"
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              Right
              <SelectDropdown
                value={rightId}
                onChange={setRightId}
                options={versionPickOptions}
                buttonClassName="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                aria-label="Right version for diff"
              />
            </label>
          </CardContent>
        </Card>
        {canDiff ? (
          <p className="mb-2 text-sm text-amber-200/90">
            {diffQuery.isLoading ? "Loading diff…" : diffQuery.isError ? "Failed to load diff" : summary}
          </p>
        ) : null}
        {!canDiff ? <p className="text-sm text-zinc-500">Select two different versions to compare.</p> : null}
        {canDiff && !diffQuery.isLoading && details.length > 0 ? (
          <DataTableShell>
            <DataTable className="text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 bg-zinc-950/80">
                <tr>
                  <th className="w-1/4 px-3 py-2 font-medium text-zinc-500">Key</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Left</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Right</th>
                </tr>
              </thead>
              <tbody>
                {details.map((row) => (
                  <tr key={row.key} className="border-t border-zinc-800">
                    <td className="align-top p-2 font-mono text-xs text-zinc-300">{row.key}</td>
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
        ) : null}
      </div>
    </div>
  );
}

export default function PipelineDiffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col p-6">
          <p className="text-sm text-zinc-500">Loading…</p>
        </div>
      }
    >
      <DiffPageInner />
    </Suspense>
  );
}
