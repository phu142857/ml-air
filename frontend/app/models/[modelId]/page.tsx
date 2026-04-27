"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import {
  checkPipelineReadiness,
  fetchDataset,
  fetchModelStatus,
  fetchModelTriggerPolicy,
  fetchModels,
  fetchModelVersions,
  fetchRun,
  promoteModelVersion,
  triggerPipelineRunWithGating,
  updateModelTriggerPolicy
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = params.modelId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [stageFilter, setStageFilter] = useState("all");
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [gateResult, setGateResult] = useState<any>(null);
  const [gateError, setGateError] = useState("");
  const [isCheckingGate, setIsCheckingGate] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineIdInput, setPipelineIdInput] = useState("vet_ai_training_pipeline");
  const [triggerMode, setTriggerMode] = useState<"manual" | "auto_ready" | "schedule">("manual");
  const [debounceMinutes, setDebounceMinutes] = useState("10");
  const [scheduleCron, setScheduleCron] = useState("0 */6 * * *");
  const [policyMsg, setPolicyMsg] = useState("");

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });
  const versionsQuery = useQuery({
    queryKey: ["model-versions", tenantId, projectId, modelId],
    queryFn: () => fetchModelVersions(tenantId, projectId, modelId, token)
  });
  const modelStatusQuery = useQuery({
    queryKey: ["model-status", tenantId, projectId, modelId],
    queryFn: () => fetchModelStatus(tenantId, projectId, modelId, token)
  });
  const latestRunQuery = useQuery({
    queryKey: ["model-status-run", tenantId, projectId, modelStatusQuery.data?.run_id],
    queryFn: () => fetchRun(tenantId, projectId, String(modelStatusQuery.data?.run_id), token),
    enabled: !!modelStatusQuery.data?.run_id
  });
  const recentRunsQuery = useQuery({
    queryKey: ["model-recent-runs", tenantId, projectId, modelId, (versionsQuery.data?.items || []).map((v) => v.run_id).join(",")],
    queryFn: async () => {
      const ids = (versionsQuery.data?.items || [])
        .map((v) => String(v.run_id || "").trim())
        .filter(Boolean)
        .slice(0, 5);
      const rows = await Promise.all(ids.map((id) => fetchRun(tenantId, projectId, id, token).catch(() => null)));
      return rows.filter(Boolean) as Array<any>;
    },
    enabled: !!versionsQuery.data?.items?.length
  });

  const gateDetails = useMemo(() => (gateResult?.details || []) as Array<any>, [gateResult]);
  const triggerPolicyQuery = useQuery({
    queryKey: ["model-trigger-policy", tenantId, projectId, modelId],
    queryFn: () => fetchModelTriggerPolicy(tenantId, projectId, modelId, token)
  });
  const freshnessQuery = useQuery({
    queryKey: ["model-gate-freshness", tenantId, projectId, gateDetails.map((d) => d.dataset_id || d.dataset).join(",")],
    queryFn: async () => {
      const pairs = await Promise.all(
        gateDetails.map(async (d) => {
          const datasetId = String(d.dataset_id || "").trim();
          if (!datasetId) return { key: d.dataset, updated_at: null };
          try {
            const ds = await fetchDataset(tenantId, projectId, datasetId, token);
            return { key: d.dataset, updated_at: ds.updated_at || ds.created_at || null };
          } catch {
            return { key: d.dataset, updated_at: null };
          }
        })
      );
      return Object.fromEntries(pairs.map((x) => [x.key, x.updated_at]));
    },
    enabled: gateDetails.length > 0
  });

  useEffect(() => {
    if (!triggerPolicyQuery.data) return;
    setTriggerMode(triggerPolicyQuery.data.trigger_mode);
    setDebounceMinutes(String(triggerPolicyQuery.data.debounce_minutes || 10));
    setScheduleCron(triggerPolicyQuery.data.schedule_cron || "0 */6 * * *");
  }, [triggerPolicyQuery.data]);

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
  const triggerPolicyMutation = useMutation({
    mutationFn: () =>
      updateModelTriggerPolicy(tenantId, projectId, modelId, token, {
        trigger_mode: triggerMode,
        debounce_minutes: Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10),
        schedule_cron: scheduleCron.trim() || "0 */6 * * *"
      }),
    onSuccess: async (saved) => {
      setPolicyMsg("Saved");
      setTriggerMode(saved.trigger_mode);
      setDebounceMinutes(String(saved.debounce_minutes || 10));
      setScheduleCron(saved.schedule_cron || "0 */6 * * *");
      await queryClient.invalidateQueries({ queryKey: ["model-trigger-policy", tenantId, projectId, modelId] });
      window.setTimeout(() => setPolicyMsg(""), 1500);
    },
    onError: (e: any) => {
      setPolicyMsg(`Save failed: ${String(e?.message || e)}`);
    }
  });

  const inferredPipelineId = String(latestRunQuery.data?.pipeline_id || "").trim();
  const pipelineId = String(pipelineIdInput || inferredPipelineId || "vet_ai_training_pipeline").trim();
  const missingReason = gateResult?.blocking_datasets?.[0]
    ? `${gateResult.blocking_datasets[0].dataset}: thiếu ${Math.max(
        0,
        Number(gateResult.blocking_datasets[0].required_size || 0) - Number(gateResult.blocking_datasets[0].actual_size || 0)
      )} rows`
    : "";
  const effectiveTriggerMode = triggerPolicyQuery.data?.trigger_mode || triggerMode;
  const effectiveDebounce = triggerPolicyQuery.data?.debounce_minutes ?? Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10);
  const effectiveCron = triggerPolicyQuery.data?.schedule_cron || scheduleCron || "0 */6 * * *";

  return (
    <RouteShell activeNav="Models" title={`Model ${model?.name ?? modelId}`} subtitle="Deep-link model versions and stages">
      <div className="mb-2">
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-blue-900/20"
          onClick={() => router.push("/models")}
        >
          Back to Models
        </button>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <div className="mb-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs">
          <div className="text-slate-200">
            Status:{" "}
            <span className={modelStatusQuery.data?.status === "READY" ? "text-emerald-400" : "text-amber-400"}>
              {modelStatusQuery.data?.status || "UNKNOWN"}
            </span>
            {missingReason ? <span className="text-slate-400"> {" · "}Reason: {missingReason}</span> : null}
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 md:grid-cols-4">
          <label className="text-xs text-slate-400">
            Pipeline
            <input
              value={pipelineIdInput}
              onChange={(e) => setPipelineIdInput(e.target.value)}
              placeholder={inferredPipelineId || "vet_ai_training_pipeline"}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Mode
            <select
              value={trainingMode}
              onChange={(e) => setTrainingMode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
            >
              <option value="quick">Quick (50)</option>
              <option value="standard">Standard (1000)</option>
              <option value="full">Full (10000)</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Required
            <input
              value={requiredSize}
              onChange={(e) => setRequiredSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              disabled={isCheckingGate}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-blue-900/20 disabled:opacity-60"
              onClick={async () => {
                setGateError("");
                setIsCheckingGate(true);
                try {
                  const req = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const out = await checkPipelineReadiness(tenantId, projectId, pipelineId, token, {
                    training_mode: trainingMode,
                    override_config: { inputs: [{ dataset: "user_events", required_size: req }] }
                  });
                  setGateResult(out);
                } catch (e: any) {
                  setGateError(String(e?.message || e));
                } finally {
                  setIsCheckingGate(false);
                }
              }}
            >
              Check
            </button>
            <button
              disabled={isRunning}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-900/20 disabled:opacity-60"
              onClick={async () => {
                setGateError("");
                setIsRunning(true);
                try {
                  const req = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const res = await triggerPipelineRunWithGating(tenantId, projectId, pipelineId, token, {
                    pipeline_id: pipelineId,
                    priority: "normal",
                    max_parallel_tasks: 1,
                    idempotency_key: `model-run-${Date.now()}`,
                    training_mode: trainingMode,
                    override_config: { inputs: [{ dataset: "user_events", required_size: req }] }
                  });
                  if (res.run_id) router.push(`/runs/${res.run_id}`);
                } catch (e: any) {
                  setGateError(String(e?.message || e));
                } finally {
                  setIsRunning(false);
                }
              }}
            >
              Run with override
            </button>
          </div>
          <div className="md:col-span-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            ⚠ Training with insufficient data may reduce accuracy
          </div>
        </div>
        {gateError ? <div className="mb-3 text-xs text-red-300">{gateError}</div> : null}
        {gateResult ? (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs text-slate-200">
              Run Preview · Pipeline: {pipelineId} · Mode: {trainingMode} · Estimate: ~30s
            </div>
            <div className="overflow-auto rounded-lg border border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Dataset</th>
                    <th className="px-2 py-1 text-left">Eligible / Minimum</th>
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-left">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {(gateResult.details || []).map((d: any) => {
                    const updated = freshnessQuery.data?.[d.dataset] || null;
                    const ageHours = updated ? Math.floor((Date.now() - Date.parse(updated)) / 3600000) : null;
                    const freshText =
                      ageHours == null ? "-" : ageHours <= 24 ? `${ageHours}h ago ✅` : `${ageHours}h ago ⚠️`;
                    return (
                      <tr key={`${d.dataset}-${d.role}`} className="border-t border-slate-800">
                        <td className="px-2 py-1">{d.dataset}</td>
                        <td className="px-2 py-1">
                          {d.actual_size} / {d.required_size}
                        </td>
                        <td className="px-2 py-1">{d.status}</td>
                        <td className="px-2 py-1">{freshText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-200">Auto Trigger Config</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "manual"}
                onChange={() => setTriggerMode("manual")}
              />
              Manual
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "auto_ready"}
                onChange={() => setTriggerMode("auto_ready")}
              />
              Auto when READY
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "schedule"}
                onChange={() => setTriggerMode("schedule")}
              />
              Schedule (cron)
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-400">
              Debounce (minutes)
              <input
                value={debounceMinutes}
                onChange={(e) => setDebounceMinutes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              Cron
              <input
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
              />
            </label>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Applied mode: <span className="text-slate-200">{effectiveTriggerMode}</span> · debounce:{" "}
            <span className="text-slate-200">{effectiveDebounce}m</span>
            {effectiveTriggerMode === "schedule" ? (
              <>
                {" · "}cron: <span className="text-slate-200">{effectiveCron}</span>
              </>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-900/20 disabled:opacity-60"
              onClick={() => triggerPolicyMutation.mutate()}
              disabled={triggerPolicyMutation.isPending}
            >
              Save Trigger Policy
            </button>
            {policyMsg ? <span className="text-xs text-slate-200">{policyMsg}</span> : null}
          </div>
        </div>

        {!!(recentRunsQuery.data || []).length && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-200">Recent Runs</h3>
            <div className="space-y-1 text-xs text-slate-200">
              {(recentRunsQuery.data || []).map((r) => (
                <div key={r.run_id} className="flex items-center justify-between rounded border border-slate-700 px-2 py-1">
                  <span>{r.run_id}</span>
                  <span>
                    {r.status} | {r.training_mode || "full"} | {r.updated_at || "-"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Lineage: user_events → {pipelineId} → {model?.name ?? modelId}
            </div>
          </div>
        )}

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
                <tr key={v.version_id} className="border-t border-slate-800 hover:border-l-4 hover:border-l-blue-500 transition-colors">
                  <td className="px-3 py-2">v{v.version}</td>
                  <td className="px-3 py-2">{v.stage}</td>
                  <td className="px-3 py-2">{v.run_id || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "production" })}
                        className="rounded-lg bg-violet-600 px-2 py-1 text-xs text-white hover:bg-blue-900/20 disabled:opacity-60"
                        disabled={promoteMutation.isPending}
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "staging" })}
                        className="rounded-lg bg-amber-600 px-2 py-1 text-xs text-white hover:bg-blue-900/20 disabled:opacity-60"
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
