"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import {
  checkPipelineReadiness,
  deleteModel,
  deleteModelVersion,
  fetchDataset,
  fetchModelResolvedPipeline,
  fetchModels,
  fetchModelServing,
  fetchModelStatus,
  fetchModelTriggerPolicy,
  fetchModelVersions,
  fetchPipelines,
  fetchRun,
  previewDatasetUpload,
  promoteModelVersion,
  setModelServingSlot,
  triggerPipelineRunWithGating,
  updateModelVersionApproval,
  uploadDatasetCsv,
  updateModelTriggerPolicy
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { modelApprovalPillClass } from "@/lib/model-governance-ui";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";

/** Set `true` when serving slot routes are re-enabled in `api/app/api/routes/v1.py`. */
const ENABLE_SERVING_SLOTS_UI = false;

const SERVING_SLOTS = ["champion", "candidate", "challenger", "canary"] as const;

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
  const [pipelineIdInput, setPipelineIdInput] = useState("");
  const [triggerMode, setTriggerMode] = useState<"manual" | "auto_ready" | "schedule">("manual");
  const [debounceMinutes, setDebounceMinutes] = useState("10");
  const [scheduleCron, setScheduleCron] = useState("0 */6 * * *");
  const [policyMsg, setPolicyMsg] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [datasetPreview, setDatasetPreview] = useState<any>(null);
  const [datasetMsg, setDatasetMsg] = useState("");
  const [uploadedDatasetVersionId, setUploadedDatasetVersionId] = useState("");
  const [isTrainingWithDataset, setIsTrainingWithDataset] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmBody, setConfirmBody] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [versionBanner, setVersionBanner] = useState("");
  const [servingSlotDraft, setServingSlotDraft] = useState<Record<string, string>>({});

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });
  const versionsQuery = useQuery({
    queryKey: ["model-versions", tenantId, projectId, modelId],
    queryFn: () => fetchModelVersions(tenantId, projectId, modelId, token)
  });
  const resolvedPipelineQuery = useQuery({
    queryKey: ["model-resolved-pipeline-ui", tenantId, projectId, modelId],
    queryFn: () => fetchModelResolvedPipeline(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token)
  });
  const pipelinesListQuery = useQuery({
    queryKey: ["pipelines-model-page", tenantId, projectId],
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token)
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

  useEffect(() => {
    setServingSlotDraft({});
    setVersionBanner("");
  }, [modelId]);

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
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, modelId] });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const servingQuery = useQuery({
    queryKey: ["model-serving", tenantId, projectId, modelId],
    queryFn: () => fetchModelServing(tenantId, projectId, modelId, token),
    enabled: ENABLE_SERVING_SLOTS_UI && Boolean(modelId && token && projectId !== "all")
  });

  const approvalMutation = useMutation({
    mutationFn: (p: { version: number; approval_status: "approved" | "rejected" }) =>
      updateModelVersionApproval(tenantId, projectId, modelId, p.version, token, {
        approval_status: p.approval_status,
        reason: p.approval_status === "rejected" ? "rejected via UI" : null
      }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, modelId] });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const servingAssignMutation = useMutation({
    mutationFn: (p: { slot: string; version: number }) =>
      setModelServingSlot(tenantId, projectId, modelId, p.slot, token, { version: p.version }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: ["model-serving", tenantId, projectId, modelId] });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
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
  const deleteModelMutation = useMutation({
    mutationFn: () => deleteModel(tenantId, projectId, modelId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["models", tenantId, projectId] });
      router.push("/models");
    }
  });
  const deleteVersionMutation = useMutation({
    mutationFn: (version: number) => deleteModelVersion(tenantId, projectId, modelId, version, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, modelId] });
    }
  });
  const previewDatasetMutation = useMutation({
    mutationFn: async () => previewDatasetUpload(tenantId, projectId, token, datasetFile as File),
    onSuccess: (data) => {
      setDatasetPreview(data);
      setDatasetMsg("");
    },
    onError: (e: any) => setDatasetMsg(`Preview failed: ${String(e?.message || e)}`)
  });
  const uploadDatasetMutation = useMutation({
    mutationFn: async () =>
      uploadDatasetCsv(tenantId, projectId, token, {
        dataset_name: datasetName.trim(),
        file: datasetFile as File
      }),
    onSuccess: (data) => {
      setDatasetPreview(data);
      setDatasetName(String(data.dataset_name || datasetName));
      setUploadedDatasetVersionId(String(data.version_id || ""));
      setDatasetMsg(`Uploaded ${data.dataset_name} ${data.version}`);
    },
    onError: (e: any) => setDatasetMsg(`Upload failed: ${String(e?.message || e)}`)
  });

  const openConfirm = (title: string, body: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const envDefaultPipelineId = (process.env.NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID || "").trim();
  const inferredPipelineId = useMemo(() => {
    const fromMapping = String(resolvedPipelineQuery.data?.pipeline_id || "").trim();
    if (fromMapping) return fromMapping;
    const fromRun = String(latestRunQuery.data?.pipeline_id || "").trim();
    if (fromRun) return fromRun;
    if (envDefaultPipelineId) return envDefaultPipelineId;
    const first = pipelinesListQuery.data?.items?.[0]?.pipeline_id;
    return String(first || "").trim();
  }, [
    resolvedPipelineQuery.data,
    latestRunQuery.data,
    pipelinesListQuery.data,
    envDefaultPipelineId
  ]);
  const pipelineId = String(pipelineIdInput || inferredPipelineId).trim();
  const readinessDatasetName = datasetName.trim();
  const gateSampleDataset = useMemo(() => {
    const rows = (gateResult?.details || []) as Array<{ dataset?: string }>;
    const d = rows.find((r) => String(r?.dataset || "").trim());
    return String(d?.dataset || "").trim();
  }, [gateResult]);
  const lineageDatasetLabel = gateSampleDataset || readinessDatasetName || "—";
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
      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        body={confirmBody}
        onCancel={() => setConfirmOpen(false)}
        onDelete={() => {
          if (confirmAction) void confirmAction();
        }}
        isLoading={deleteModelMutation.isPending || deleteVersionMutation.isPending}
      />
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-blue-900/20"
            onClick={() => router.push("/models")}
          >
            Back to Models
          </button>
          <button
            className="btn-action-delete rounded-xl px-3 py-2 text-sm disabled:opacity-60"
            onClick={() =>
              openConfirm(
                "Delete model",
                `Delete model "${model?.name || modelId}" and all of its versions?`,
                async () => {
                  await deleteModelMutation.mutateAsync();
                  setConfirmOpen(false);
                }
              )
            }
            disabled={deleteModelMutation.isPending}
          >
            Delete model
          </button>
        </div>
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
              placeholder={inferredPipelineId || "from mapping / last run / NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID / first pipeline"}
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
              disabled={isCheckingGate || !pipelineId || !readinessDatasetName}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-blue-900/20 disabled:opacity-60"
              onClick={async () => {
                setGateError("");
                if (!pipelineId) {
                  setGateError("No pipeline_id: configure mapping, run history, NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID, or type one.");
                  return;
                }
                if (!readinessDatasetName) {
                  setGateError("Enter dataset name (must match pipeline readiness input dataset).");
                  return;
                }
                setIsCheckingGate(true);
                try {
                  const req = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const out = await checkPipelineReadiness(tenantId, projectId, pipelineId, token, {
                    training_mode: trainingMode,
                    override_config: { inputs: [{ dataset: readinessDatasetName, required_size: req }] }
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
              disabled={isRunning || !pipelineId || !readinessDatasetName}
              className="btn-action-primary rounded-lg px-3 py-2 text-xs disabled:opacity-60"
              onClick={async () => {
                setGateError("");
                if (!pipelineId) {
                  setGateError("No pipeline_id: configure mapping, run history, NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID, or type one.");
                  return;
                }
                if (!readinessDatasetName) {
                  setGateError("Enter dataset name (must match pipeline readiness input dataset).");
                  return;
                }
                setIsRunning(true);
                try {
                  const req = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const res = await triggerPipelineRunWithGating(tenantId, projectId, pipelineId, token, {
                    pipeline_id: pipelineId,
                    priority: "normal",
                    max_parallel_tasks: 1,
                    idempotency_key: `model-run-${Date.now()}`,
                    training_mode: trainingMode,
                    override_config: { inputs: [{ dataset: readinessDatasetName, required_size: req }] }
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
        </div>
        {gateError ? <div className="mb-3 text-xs text-red-300">{gateError}</div> : null}
        {gateResult ? (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs text-slate-200">
              Run Preview · Pipeline: {pipelineId || "—"} · Dataset: {readinessDatasetName || "—"} · Mode: {trainingMode}
            </div>
            <div className="overflow-auto rounded-lg border border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-muted">
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
          <h3 className="mb-2 text-xs font-semibold text-slate-200">Add Dataset (CSV)</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-400 md:col-span-1">
              Dataset name
              <input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
                placeholder="name matching pipeline input dataset"
              />
            </label>
            <label className="text-xs text-slate-400 md:col-span-2">
              CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setDatasetFile(e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100"
              />
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="btn-action-cancel rounded-lg px-3 py-1 text-xs disabled:opacity-60"
              onClick={() => previewDatasetMutation.mutate()}
              disabled={!datasetFile || previewDatasetMutation.isPending}
            >
              Preview CSV
            </button>
            <button
              className="btn-action-enable rounded-lg px-3 py-1 text-xs disabled:opacity-60"
              onClick={() => uploadDatasetMutation.mutate()}
              disabled={!datasetFile || !datasetName.trim() || uploadDatasetMutation.isPending}
            >
              Create Dataset Version
            </button>
            <button
              className="btn-action-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60"
              onClick={async () => {
                setDatasetMsg("");
                if (!pipelineId) {
                  setDatasetMsg("No pipeline_id: configure mapping, run history, NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID, or type one.");
                  return;
                }
                setIsTrainingWithDataset(true);
                try {
                  const req = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const res = await triggerPipelineRunWithGating(tenantId, projectId, pipelineId, token, {
                    pipeline_id: pipelineId,
                    idempotency_key: `dataset-train-${Date.now()}`,
                    priority: "normal",
                    max_parallel_tasks: 1,
                    training_mode: trainingMode,
                    override_config: {
                      dataset_version_id: uploadedDatasetVersionId || undefined,
                      inputs: [{ dataset: datasetName.trim(), required_size: req }]
                    }
                  });
                  if (res.run_id) {
                    router.push(`/runs/${res.run_id}`);
                    return;
                  }
                  setDatasetMsg("Training triggered but run_id was empty.");
                } catch (e: any) {
                  setDatasetMsg(`Train failed: ${String(e?.message || e)}`);
                } finally {
                  setIsTrainingWithDataset(false);
                }
              }}
              disabled={!datasetName.trim() || !pipelineId || isTrainingWithDataset}
            >
              Train with this dataset
            </button>
            {datasetMsg ? <span className="text-xs text-slate-200">{datasetMsg}</span> : null}
          </div>
          {datasetPreview ? (
            <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              Columns: {datasetPreview.columns?.join(", ") || "-"} · Rows: {datasetPreview.row_count ?? 0}
              {uploadedDatasetVersionId ? (
                <span>
                  {" "}
                  · Dataset version: <span className="text-slate-200">{uploadedDatasetVersionId}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

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
          <div className="mt-2 text-caption text-slate-400">
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
              className="btn-action-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60"
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
                    {r.status} | {r.training_mode || "full"} | {formatDateTimeCompact(r.updated_at)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Lineage: {lineageDatasetLabel} → {pipelineId || "—"} → {model?.name ?? modelId}
            </div>
          </div>
        )}

        {projectId !== "all" && ENABLE_SERVING_SLOTS_UI ? (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-200">Serving slots</h3>
            <p className="mb-2 text-caption text-slate-400">
              Map a registry version to champion / candidate / challenger / canary for routing metadata.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {SERVING_SLOTS.map((slot) => {
                const cur = servingQuery.data?.slots?.[slot];
                return (
                  <div
                    key={slot}
                    className="flex flex-wrap items-center gap-2 rounded border border-slate-700 px-2 py-2 text-xs"
                  >
                    <span className="font-medium capitalize text-slate-200">{slot}</span>
                    <span className="text-slate-400">{cur ? `v${cur.version}` : "—"}</span>
                    <input
                      type="number"
                      min={1}
                      value={servingSlotDraft[slot] ?? ""}
                      onChange={(e) =>
                        setServingSlotDraft((prev) => ({ ...prev, [slot]: e.target.value }))
                      }
                      placeholder="ver"
                      className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-700 px-2 py-1 text-caption text-slate-100 hover:bg-slate-600 disabled:opacity-60"
                      disabled={servingAssignMutation.isPending}
                      onClick={() => {
                        const n = Number.parseInt(String(servingSlotDraft[slot] || "").trim(), 10);
                        if (!Number.isFinite(n) || n < 1) return;
                        servingAssignMutation.mutate({ slot, version: n });
                      }}
                    >
                      Set
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section font-semibold text-slate-200">Versions</h2>
          {versionBanner ? (
            <span className="version-inline-banner">{versionBanner}</span>
          ) : null}
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
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-[110px] px-3 py-2 text-left">Version</th>
                <th className="w-[120px] px-3 py-2 text-left">Stage</th>
                <th className="w-[160px] px-3 py-2 text-left">Approval</th>
                <th className="px-3 py-2 text-left">Run</th>
                <th className="min-w-[420px] px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version_id} className="interactive-row border-t border-slate-800 transition-colors">
                  <td className="px-3 py-2">v{v.version}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block w-full truncate">{v.stage}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-block w-fit max-w-full truncate ${modelApprovalPillClass(
                          v.approval_status
                        )}`}
                        title={v.approval_reason || undefined}
                      >
                        {v.approval_status || "—"}
                      </span>
                      {projectId !== "all" && v.approval_status === "pending_manual_approval" ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="approval-action-btn approval-action-btn--approve"
                            disabled={approvalMutation.isPending}
                            onClick={() =>
                              approvalMutation.mutate({ version: v.version, approval_status: "approved" })
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="approval-action-btn approval-action-btn--reject"
                            disabled={approvalMutation.isPending}
                            onClick={() =>
                              approvalMutation.mutate({ version: v.version, approval_status: "rejected" })
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block w-full truncate">{v.run_id || "-"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "production" })}
                        className="action-btn-sm btn-action-promote rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={promoteMutation.isPending || v.stage === "production"}
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "staging" })}
                        className="action-btn-md btn-action-rollback rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={promoteMutation.isPending || v.stage === "staging"}
                      >
                        Rollback to staging
                      </button>
                      <button
                        onClick={() =>
                          openConfirm(
                            "Delete version",
                            `Delete version v${v.version} of model "${model?.name || modelId}"?`,
                            async () => {
                              await deleteVersionMutation.mutateAsync(v.version);
                              setConfirmOpen(false);
                            }
                          )
                        }
                        className="action-btn-xs btn-action-delete rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={deleteVersionMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versions.length && (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={5}>
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

function ConfirmDialog({
  open,
  title,
  body,
  onDelete,
  onCancel,
  isLoading
}: {
  open: boolean;
  title: string;
  body: string;
  onDelete: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <h3 className="mb-2 text-section font-semibold text-slate-200">{title}</h3>
        <p className="mb-4 text-sm text-slate-400">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-action-cancel rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="btn-action-delete rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
