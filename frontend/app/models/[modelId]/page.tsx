"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchModels, fetchModelVersions, promoteModelVersion } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = params.modelId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [stageFilter, setStageFilter] = useState("all");

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });
  const versionsQuery = useQuery({
    queryKey: ["model-versions", tenantId, projectId, modelId],
    queryFn: () => fetchModelVersions(tenantId, projectId, modelId, token)
  });

  const model = useMemo(() => modelsQuery.data?.items.find((x) => x.model_id === modelId) ?? null, [modelsQuery.data, modelId]);

  const versions = useMemo(() => {
    const items = versionsQuery.data?.items ?? [];
    if (stageFilter === "all") return items;
    return items.filter((v) => v.stage === stageFilter);
  }, [versionsQuery.data, stageFilter]);

  const promoteMutation = useMutation({
    mutationFn: ({ version, stage }: { version: number; stage: string }) =>
      promoteModelVersion(tenantId, projectId, modelId, token, { version, stage }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, modelId] });
    }
  });

  return (
    <RouteShell activeNav="Models" title={`Model ${model?.name ?? modelId}`} subtitle="Deep-link model versions and stages">
      <div className="mb-2">
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          onClick={() => router.push("/models")}
        >
          Back to Models
        </button>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Versions</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Filter stage</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="all">all</option>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Version</th>
                <th className="px-3 py-2 text-left">Stage</th>
                <th className="px-3 py-2 text-left">Run</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version_id} className="border-t border-slate-800">
                  <td className="px-3 py-2">v{v.version}</td>
                  <td className="px-3 py-2">{v.stage}</td>
                  <td className="px-3 py-2">{v.run_id || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "production" })}
                        className="rounded-lg bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-60"
                        disabled={promoteMutation.isPending}
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "staging" })}
                        className="rounded-lg bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-60"
                        disabled={promoteMutation.isPending}
                      >
                        Rollback to staging
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versions.length && (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={4}>
                    No versions for current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RouteShell>
  );
}
