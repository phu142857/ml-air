"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { createPipelineVersionApi, listPipelineVersionsApi } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

const defaultConfigJson = `{
  "steps": ["fetch", "train", "evaluate"],
  "params": { "max_epochs": 10 }
}`;

export default function PipelineVersionsPage() {
  const router = useRouter();
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = decodeURIComponent(params.pipelineId);
  const { tenantId, projectId, token } = useAppContext();
  const qc = useQueryClient();
  const [jsonText, setJsonText] = useState(defaultConfigJson);
  const [err, setErr] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["pipeline-versions", pipelineId, tenantId, projectId],
    queryFn: () => listPipelineVersionsApi(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token)
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        throw new Error("Invalid JSON");
      }
      return createPipelineVersionApi(tenantId, projectId, pipelineId, token, config);
    },
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["pipeline-versions", pipelineId] });
    },
    onError: (e: Error) => setErr(e.message)
  });

  const items = listQuery.data?.items ?? [];
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");

  return (
    <RouteShell
      activeNav="Pipelines"
      title={`Pipeline versions · ${pipelineId}`}
      subtitle="Immutable config snapshots; use diff to compare"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm"
          onClick={() => router.push("/pipelines")}
        >
          Back
        </button>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}`}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm"
        >
          DAG
        </Link>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/diff${left && right ? `?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}` : ""}`}
          className="rounded-lg border border-amber-600/50 bg-amber-950/20 px-3 py-1.5 text-sm text-amber-100"
        >
          Open diff
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Create version</h2>
          <p className="mb-2 text-xs text-slate-500">POST creates the next monotonic version; previous rows are not modified.</p>
          <textarea
            className="mb-2 h-40 w-full rounded-xl border border-slate-600 bg-slate-950 p-2 font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
          <button
            type="button"
            disabled={createMut.isPending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Creating…" : "Create new version"}
          </button>
        </section>
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Compare (pick two, then Open diff)</h2>
          <div className="flex flex-col gap-2 text-sm">
            <label className="text-slate-400">
              Version A
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1"
                value={left}
                onChange={(e) => setLeft(e.target.value)}
              >
                <option value="">—</option>
                {items.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    v{v.version} · {v.version_id.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
            <label className="text-slate-400">
              Version B
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1"
                value={right}
                onChange={(e) => setRight(e.target.value)}
              >
                <option value="">—</option>
                {items.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    v{v.version} · {v.version_id.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">All versions</h2>
        {listQuery.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">version_id</th>
                <th className="py-2 pr-2">created</th>
                <th className="py-2">config (preview)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.version_id} className="border-t border-slate-800">
                  <td className="py-2 pr-2 align-top font-mono">{v.version}</td>
                  <td className="py-2 pr-2 align-top font-mono text-xs text-slate-400">{v.version_id}</td>
                  <td className="py-2 pr-2 align-top text-xs text-slate-500">{v.created_at}</td>
                  <td className="py-2 align-top">
                    <pre className="max-h-32 max-w-xl overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
                      {JSON.stringify(v.config, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && !listQuery.isLoading && (
            <p className="py-4 text-sm text-slate-500">No versions yet. Create one on the left.</p>
          )}
        </div>
      </section>
    </RouteShell>
  );
}
