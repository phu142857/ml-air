"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { getPipelineVersionDiff, listPipelineVersionsApi } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-300">
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
    queryKey: ["pipeline-versions", pipelineId, tenantId, projectId],
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
    queryKey: ["pipeline-diff", leftId, rightId, tenantId, projectId],
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
        <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`} className="text-blue-400 hover:underline">
          ← Versions
        </Link>
        <span className="text-slate-600">|</span>
        <Link href={`/pipelines/${encodeURIComponent(pipelineId)}`} className="text-slate-400 hover:underline">
          DAG
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="text-sm text-slate-400">
          Left
          <select
            className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-slate-200"
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
        <label className="text-sm text-slate-400">
          Right
          <select
            className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-slate-200"
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
      </div>
      {canDiff && (
        <p className="mb-2 text-sm text-amber-200/80">
          {diffQuery.isLoading ? "Loading diff…" : diffQuery.isError ? "Failed to load diff" : summary}
        </p>
      )}
      {!canDiff && <p className="text-sm text-slate-500">Select two different versions to compare.</p>}
      {canDiff && !diffQuery.isLoading && details.length > 0 && (
        <div className="overflow-auto rounded-2xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="w-1/4 px-3 py-2">Key</th>
                <th className="px-3 py-2">Left</th>
                <th className="px-3 py-2">Right</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row) => (
                <tr key={row.key} className="border-t border-slate-800">
                  <td className="align-top font-mono text-xs text-blue-300">{row.key}</td>
                  <td className="align-top p-2">
                    <JsonBlock value={row.left} />
                  </td>
                  <td className="align-top p-2">
                    <JsonBlock value={row.right} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RouteShell>
  );
}

export default function PipelineDiffPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading…</div>}>
      <DiffPageInner />
    </Suspense>
  );
}
