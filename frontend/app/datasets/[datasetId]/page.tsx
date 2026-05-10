"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  fetchDataset,
  fetchDatasetBuffer,
  fetchDatasetReadinessEvaluations,
  fetchDatasetReadiness,
  createDatasetTrainingPolicy,
  fetchDatasetTrainingPolicies,
  fetchDatasetVersions,
  materializeDatasetBuffer,
  materializeScheduledDatasetBuffers,
  patchDatasetBuffer,
  fetchModels,
  fetchModelResolvedPipeline,
  fetchPipelineVersions,
  upsertDatasetTrainingPolicy,
  normalizeProjectId
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { datasetStatusBadgeClass, normalizeDatasetStatus } from "@/lib/status-style";
import { executeTrainingIntent } from "@/lib/training-intent";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";

function sourceTypeBadge(sourceType: string | null | undefined): { label: string; className: string } {
  const raw = String(sourceType || "manual_upload").trim().toLowerCase();
  if (raw === "csv_import" || raw === "manual_upload") {
    return {
      label: "IMPORTED DATASET",
      className: "border-primary/40 bg-primary/10 text-primary"
    };
  }
  if (raw === "runtime_feedback" || raw === "runtime_accumulation") {
    return {
      label: "RUNTIME ACCUMULATED",
      className: "border-border bg-secondary text-muted-foreground"
    };
  }
  return {
    label: raw.toUpperCase().replace(/_/g, " "),
    className: "border-border bg-muted text-muted-foreground"
  };
}

function describeTrainError(err: unknown): string {
  const fallback = String((err as { message?: string })?.message || err || "Unknown error");
  try {
    const parsed = JSON.parse(fallback);
    const detail = parsed?.detail;
    if (detail?.status === "BLOCKED") {
      const reason = String(detail?.reason || "BLOCKED");
      const details = String(detail?.details || "");
      return details ? `Train blocked (${reason}): ${details}` : `Train blocked (${reason})`;
    }
    if (typeof detail === "string" && detail.trim()) return `Train failed: ${detail}`;
  } catch {
    // keep fallback
  }
  return `Train failed: ${fallback}`;
}

export default function DatasetHubPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = decodeURIComponent(params.datasetId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [trainMsg, setTrainMsg] = useState("");
  const [policyMsg, setPolicyMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "versions" | "readiness" | "accumulation" | "training">("overview");
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [policyRequiredSizeDraft, setPolicyRequiredSizeDraft] = useState("1000");
  const [newPolicyTriggerMode, setNewPolicyTriggerMode] = useState("manual");
  const [evaluationPage, setEvaluationPage] = useState(0);
  const [maxEvaluationPage, setMaxEvaluationPage] = useState(0);
  const [evaluationStatusFilter, setEvaluationStatusFilter] = useState("all");
  const [accumulationThresholdDraft, setAccumulationThresholdDraft] = useState("");
  const [accumulationStrategyDraft, setAccumulationStrategyDraft] = useState("snapshot_on_threshold");
  const [accumulationMsg, setAccumulationMsg] = useState("");
  const [scheduleTickLimit, setScheduleTickLimit] = useState("50");
  const [scheduleTickResult, setScheduleTickResult] = useState<{
    checked: number;
    materialized_count: number;
    materialized: Array<{ dataset_id: string; dataset_version_id: string; version: string; strategy: string }>;
    skipped: Array<Record<string, unknown>>;
  } | null>(null);

  const datasetQuery = useQuery({
    queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId),
    queryFn: () => fetchDataset(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    ...realtimeFallbackPolling()
  });
  const dataset = datasetQuery.data ?? null;

  const versionsQuery = useQuery({
    queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetVersions(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    ...realtimeFallbackPolling()
  });
  const selectedVersionForReadiness = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    if (!items.length) return undefined;
    if (selectedVersionId) {
      const matched = items.find((v) => v.version_id === selectedVersionId);
      if (matched) return matched.version_id;
    }
    return items[0]?.version_id;
  }, [versionsQuery.data, selectedVersionId]);
  const selectedVersionRecordCount = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    const picked = items.find((v) => v.version_id === selectedVersionForReadiness);
    return Number(picked?.record_count || 0);
  }, [versionsQuery.data, selectedVersionForReadiness]);

  const readinessQuery = useQuery({
    queryKey: [
      ...mlairKeys.datasets.readiness(tenantId, projectId, datasetId, 0),
      selectedVersionForReadiness || "latest",
      selectedPolicyId || "default-policy"
    ],
    queryFn: () =>
      fetchDatasetReadiness(tenantId, projectId, datasetId, token, 1000, selectedVersionForReadiness, selectedPolicyId || undefined),
    enabled: Boolean(datasetId && token && dataset && selectedPolicyId),
    ...realtimeFallbackPolling()
  });
  const bufferQuery = useQuery({
    queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetBuffer(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token && dataset),
    ...realtimeFallbackPolling()
  });

  useEffect(() => {
    const t = bufferQuery.data?.target_threshold;
    if (t != null && Number.isFinite(Number(t))) {
      setAccumulationThresholdDraft(String(t));
    }
    const s = String(bufferQuery.data?.accumulation_strategy || "snapshot_on_threshold").trim();
    setAccumulationStrategyDraft(
      s === "rolling_accumulate" || s === "snapshot_on_schedule" || s === "manual_materialize_only"
        ? s
        : "snapshot_on_threshold"
    );
  }, [bufferQuery.data?.target_threshold, bufferQuery.data?.accumulation_strategy, datasetId]);

  const patchBufferMutation = useMutation({
    mutationFn: async () => {
      const n = Number.parseInt(accumulationThresholdDraft, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(JSON.stringify({ detail: "target_threshold must be >= 1" }));
      return patchDatasetBuffer(tenantId, projectId, datasetId, token, {
        target_threshold: n,
        accumulation_strategy: accumulationStrategyDraft
      });
    },
    onSuccess: async () => {
      setAccumulationMsg("Materialization target saved.");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) });
    },
    onError: (err: unknown) => {
      setAccumulationMsg(describeTrainError(err));
    }
  });
  const materializeBufferMutation = useMutation({
    mutationFn: async () => materializeDatasetBuffer(tenantId, projectId, datasetId, token),
    onSuccess: async (out) => {
      setAccumulationMsg(`Materialized ${out.version} (${out.dataset_version_id.slice(0, 8)}…).`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId) })
      ]);
    },
    onError: (err: unknown) => setAccumulationMsg(describeTrainError(err))
  });
  const materializeScheduledMutation = useMutation({
    mutationFn: async () =>
      materializeScheduledDatasetBuffers(tenantId, projectId, token, Number.parseInt(scheduleTickLimit, 10) || 50),
    onSuccess: async (out) => {
      setScheduleTickResult(out);
      setAccumulationMsg(`Schedule tick checked=${out.checked}, materialized=${out.materialized_count}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId) })
      ]);
    },
    onError: (err: unknown) => setAccumulationMsg(describeTrainError(err))
  });
  const readinessEvaluationsQuery = useQuery({
    queryKey: [...mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId), evaluationPage],
    queryFn: () =>
      fetchDatasetReadinessEvaluations(tenantId, projectId, datasetId, token, 20, evaluationPage * 20),
    enabled: Boolean(datasetId && token && dataset),
    ...realtimeFallbackPolling()
  });
  const policiesQuery = useQuery({
    queryKey: mlairKeys.datasets.trainingPolicies(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetTrainingPolicies(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token && dataset),
    ...realtimeFallbackPolling()
  });

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });
  const trainingEligibilityRows = useMemo(() => {
    const modelIds = new Set((modelsQuery.data?.items || []).map((m) => String(m.model_id)));
    return (policiesQuery.data?.items || []).map((p) => {
      const sizePass = selectedVersionRecordCount >= Number(p.required_size || 0);
      const modelId = String(p.model_id || "").trim();
      const compatibilityPass = !modelId || modelIds.has(modelId);
      const eligible = sizePass && compatibilityPass;
      return {
        policyId: p.policy_id,
        triggerMode: p.trigger_mode,
        modelId: modelId || null,
        requiredSize: Number(p.required_size || 0),
        currentSize: selectedVersionRecordCount,
        eligible,
        reasons: [
          !sizePass ? `size ${selectedVersionRecordCount} < ${Number(p.required_size || 0)}` : null,
          !compatibilityPass ? `model_id ${modelId} not found` : null
        ].filter(Boolean) as string[]
      };
    });
  }, [modelsQuery.data, policiesQuery.data, selectedVersionRecordCount]);

  const resolvedPipelineQuery = useQuery({
    queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelResolvedPipeline(tenantId, projectId, selectedModelId, token),
    enabled: Boolean(selectedModelId && token)
  });

  const effectivePipeline = resolvedPipelineQuery.data?.pipeline_id || "";
  const pipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, effectivePipeline),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, effectivePipeline, token),
    enabled: Boolean(effectivePipeline && token)
  });
  const pluginPrecheck = useMemo(() => {
    if (!effectivePipeline) return { ok: false, reason: "Select a model with a resolved pipeline" };
    const items = pipelineVersionsQuery.data?.items || [];
    if (!items.length) return { ok: false, reason: "Pipeline has no version" };
    const latest = items[0];
    const cfg = (latest?.config || {}) as Record<string, unknown>;
    const tasks = cfg.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { ok: false, reason: "Pipeline tasks are not configured" };
    }
    const hasPlugin = tasks.every((t) => {
      if (!t || typeof t !== "object") return false;
      return Boolean(String((t as Record<string, unknown>).plugin || "").trim());
    });
    if (!hasPlugin) return { ok: false, reason: "Task plugin is missing in pipeline config" };
    return { ok: true, reason: "" };
  }, [effectivePipeline, pipelineVersionsQuery.data]);
  const evaluationItems = readinessEvaluationsQuery.data?.items || [];
  const canLoadOlderEvaluations = evaluationItems.length === 20;
  const filteredEvaluationItems = useMemo(() => {
    if (evaluationStatusFilter === "all") return evaluationItems;
    return evaluationItems.filter((row) => String(row.status || "blocked").toLowerCase() === evaluationStatusFilter);
  }, [evaluationItems, evaluationStatusFilter]);
  const policyPresets = [
    { id: "small", label: "Small incremental training", requiredSize: 100 },
    { id: "daily", label: "Daily retrain", requiredSize: 1000 },
    { id: "production", label: "Production promotion gate", requiredSize: 5000 }
  ] as const;
  const applyPolicyRequiredSize = async (requiredSizeValue: number) => {
    const req = Math.max(1, Math.floor(requiredSizeValue));
    const current = (policiesQuery.data?.items || []).find((p) => p.policy_id === selectedPolicyId);
    if (!current) return;
    try {
      setPolicyMsg("");
      await upsertDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        policy_id: current.policy_id,
        model_id: current.model_id || undefined,
        required_size: req,
        freshness_hours: current.freshness_hours,
        trigger_mode: current.trigger_mode,
        validation_rules: current.validation_rules || []
      });
      setPolicyRequiredSizeDraft(String(req));
      await policiesQuery.refetch();
      await readinessQuery.refetch();
      setPolicyMsg(`Policy updated to ${req} rows and re-evaluated.`);
    } catch (err) {
      setPolicyMsg(`Policy update failed: ${String((err as Error)?.message || err)}`);
    }
  };
  const createPolicy = async () => {
    const req = Math.max(1, Number.parseInt(policyRequiredSizeDraft, 10) || 1);
    try {
      setPolicyMsg("");
      const created = await createDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        required_size: req,
        freshness_hours: 24,
        trigger_mode: newPolicyTriggerMode,
        validation_rules: []
      });
      await policiesQuery.refetch();
      setSelectedPolicyId(created.policy_id);
      setPolicyRequiredSizeDraft(String(created.required_size || req));
      await readinessQuery.refetch();
      setPolicyMsg("Policy created and selected.");
    } catch (err) {
      setPolicyMsg(`Create policy failed: ${String((err as Error)?.message || err)}`);
    }
  };
  useEffect(() => {
    const firstPolicy = policiesQuery.data?.items?.[0];
    if (!firstPolicy) return;
    setSelectedPolicyId((prev) => prev || firstPolicy.policy_id);
    setPolicyRequiredSizeDraft(String(firstPolicy.required_size || 1000));
  }, [policiesQuery.data]);
  const datasetSubtitle = dataset
    ? `dataset_id: ${dataset.dataset_id} · updated: ${formatDateTimeCompact(dataset.updated_at || dataset.created_at)}`
    : "Readiness, versions, and intent-driven training (dataset / model lifecycle hub)";

  return (
    <RouteShell
      activeNav="Datasets"
      title={dataset ? `Dataset · ${dataset.name}` : `Dataset ${datasetId.slice(0, 8)}…`}
      subtitle={datasetSubtitle}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/datasets"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          ← All datasets
        </Link>
        <Link
          href={`/lineage?datasetVersionId=${encodeURIComponent(versionsQuery.data?.items?.[0]?.version_id || "")}`}
          className={`rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary ${!versionsQuery.data?.items?.[0]?.version_id ? "pointer-events-none opacity-50" : ""}`}
        >
          Lineage (latest version)
        </Link>
      </div>

      {datasetQuery.isError && datasetQuery.isFetched ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not load dataset (check scope or id).
        </div>
      ) : null}

      <div className="mb-4 border-b border-border">
        <div className="flex flex-wrap gap-1">
          {[
            { id: "overview", label: "Overview" },
            { id: "versions", label: "Versions" },
            { id: "readiness", label: "Readiness" },
            { id: "accumulation", label: "Accumulation" },
            { id: "training", label: "Training" }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`tab-stable px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                activeTab === tab.id ? "border-color-primary text-color-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle Layers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="rounded-lg border border-border bg-muted px-2 py-1">
                  <span className="font-semibold text-foreground">Buffer</span>: mutable accumulation state (not trainable snapshot).
                </div>
                <div className="rounded-lg border border-border bg-muted px-2 py-1">
                  <span className="font-semibold text-foreground">Version</span>: immutable dataset snapshot (`vN`) used for training.
                </div>
                <div className="rounded-lg border border-border bg-muted px-2 py-1">
                  <span className="font-semibold text-foreground">Readiness</span>: evaluate (`dataset_version`, `policy`) {"->"} eligible/blocked.
                </div>
                <div className="rounded-lg border border-border bg-muted px-2 py-1">
                  <span className="font-semibold text-foreground">Eligibility</span>: policy decision shown in readiness criteria and run gate.
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dataset Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div>Latest version: <span className="font-semibold text-foreground">{versionsQuery.data?.items?.[0]?.version || "—"}</span></div>
                <div>
                  Latest source:{" "}
                  {(() => {
                    const b = sourceTypeBadge(versionsQuery.data?.items?.[0]?.source_type);
                    return (
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>
                        {b.label}
                      </span>
                    );
                  })()}
                </div>
                <div>Total versions: <span className="font-semibold text-foreground">{(versionsQuery.data?.items || []).length}</span></div>
                <div>Current size: <span className="font-semibold text-foreground">{Number(dataset?.current_size || 0)}</span></div>
                <div>Readiness status: <span className="font-semibold text-foreground">{String(readinessQuery.data?.status || "pending")}</span></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Eligibility Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              {(readinessQuery.data?.eligibility_criteria || []).length ? (
                <div className="space-y-2 text-xs">
                  {(readinessQuery.data?.eligibility_criteria || []).map((c) => (
                    <div key={c.code} className="flex items-center justify-between rounded-lg border border-border bg-muted px-2 py-1">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          c.status === "pass"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {c.status === "pass" ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No eligibility checks yet.</p>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Training Eligibility Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[11px] text-muted-foreground">
                Version scope:{" "}
                <span className="font-mono text-foreground">{selectedVersionForReadiness || "latest"}</span>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {trainingEligibilityRows.length ? (
                  trainingEligibilityRows.map((r) => (
                    <div key={r.policyId} className="rounded-lg border border-border bg-muted px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-foreground">{r.policyId}</span>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            r.eligible
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {r.eligible ? "ELIGIBLE" : "BLOCKED"}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        mode={r.triggerMode} · current={r.currentSize} · required={r.requiredSize}
                        {r.modelId ? ` · model=${r.modelId}` : " · model=any"}
                      </div>
                      {!r.eligible && r.reasons.length ? (
                        <div className="mt-1 text-amber-300/90">{r.reasons.join(" ; ")}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">No training policies yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "readiness" ? (
        <Card>
          <CardHeader>
            <CardTitle>Readiness Policy Evaluation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Enterprise mode: evaluate <span className="text-foreground">dataset_version + policy</span>.
            </p>
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Version for readiness
                <select
                  value={selectedVersionForReadiness || ""}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                >
                  {(versionsQuery.data?.items || []).map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      {v.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Policy
                <select
                  value={selectedPolicyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPolicyId(id);
                    const picked = (policiesQuery.data?.items || []).find((p) => p.policy_id === id);
                    if (picked) setPolicyRequiredSizeDraft(String(picked.required_size || 1000));
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                >
                  {(policiesQuery.data?.items || []).map((p) => (
                    <option key={p.policy_id} value={p.policy_id}>
                      {p.trigger_mode} · min_rows={p.required_size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <select
                value={newPolicyTriggerMode}
                onChange={(e) => setNewPolicyTriggerMode(e.target.value)}
                className="w-40 rounded-lg border border-border bg-muted px-2 py-2 text-xs text-foreground"
              >
                <option value="manual">manual</option>
                <option value="auto_ready">auto_ready</option>
                <option value="schedule">schedule</option>
              </select>
              <input
                type="number"
                min={1}
                value={policyRequiredSizeDraft}
                onChange={(e) => setPolicyRequiredSizeDraft(e.target.value)}
                className="w-48 appearance-none rounded-lg border border-border bg-muted px-2 py-2 text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={!selectedPolicyId}
                onClick={async () => applyPolicyRequiredSize(Number.parseInt(policyRequiredSizeDraft, 10) || 1)}
              >
                Confirm Policy
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1 text-xs"
                onClick={createPolicy}
              >
                Create Policy
              </Button>
              {policyMsg ? <span className="text-xs text-muted-foreground">{policyMsg}</span> : null}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {policyPresets.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  disabled={!selectedPolicyId}
                  onClick={async () => applyPolicyRequiredSize(preset.requiredSize)}
                >
                  {preset.label} ({preset.requiredSize})
                </Button>
              ))}
            </div>
            {readinessQuery.data ? (
              <div className="rounded-xl border border-border bg-muted p-3 text-sm">
                <div className="mb-2 text-foreground">
                  Eligibility:{" "}
                  <span className={readinessQuery.data.ready ? "text-emerald-400" : "text-red-400"}>
                    {String(readinessQuery.data.eligibility_status || readinessQuery.data.status || "blocked")}
                  </span>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  Current: {readinessQuery.data.current_size} · Required: {readinessQuery.data.required_size}
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  Evaluated version:{" "}
                  <span className="font-mono text-foreground">{readinessQuery.data.dataset_version_id || "—"}</span>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  Policy: <span className="font-mono text-foreground">{readinessQuery.data.policy_id || "—"}</span>
                </div>
                {(readinessQuery.data.eligibility_criteria || []).length ? (
                  <div className="mt-3 space-y-2">
                    {(readinessQuery.data.eligibility_criteria || []).map((c) => (
                      <div key={c.code} className="flex items-center justify-between rounded-lg border border-border bg-background px-2 py-1 text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            c.status === "pass"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {c.status === "pass" ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{readinessQuery.isLoading ? "Loading…" : "—"}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "accumulation" ? (
        <Card>
          <CardHeader>
            <CardTitle>Active Accumulation Buffer</CardTitle>
          </CardHeader>
          <CardContent>
            {bufferQuery.isLoading && !bufferQuery.data ? (
              <p className="text-xs text-muted-foreground">Loading buffer…</p>
            ) : bufferQuery.data ? (
              <div className="space-y-3 text-xs text-muted-foreground">
                <p className="text-[11px] leading-relaxed">
                  <span className="text-foreground">Materialization target</span> is the row count at which runtime accumulation
                  can finalize a new dataset version (runtime_feedback lineage path). Separate from training policy{" "}
                  <span className="text-foreground">required_size</span> (readiness).
                </p>
                {accumulationStrategyDraft === "snapshot_on_schedule" ? (
                  <p className="text-[11px] leading-relaxed">
                    Schedule strategy is project-scoped. Use <span className="text-foreground">Run schedule tick</span> to process
                    eligible buffers for this project and materialize immutable versions.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Strategy</span>
                    <select
                      value={accumulationStrategyDraft}
                      onChange={(e) => {
                        setAccumulationMsg("");
                        setAccumulationStrategyDraft(e.target.value);
                      }}
                      className="rounded-lg border border-border bg-muted px-2 py-2 text-sm text-foreground"
                    >
                      <option value="snapshot_on_threshold">snapshot_on_threshold</option>
                      <option value="rolling_accumulate">rolling_accumulate</option>
                      <option value="snapshot_on_schedule">snapshot_on_schedule</option>
                      <option value="manual_materialize_only">manual_materialize_only</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Target threshold (min)</span>
                    <input
                      type="number"
                      min={1}
                      value={accumulationThresholdDraft}
                      onChange={(e) => {
                        setAccumulationMsg("");
                        setAccumulationThresholdDraft(e.target.value);
                      }}
                      className="w-32 appearance-none rounded-lg border border-border bg-muted px-2 py-2 text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1 text-xs"
                    disabled={patchBufferMutation.isPending || materializeBufferMutation.isPending}
                    onClick={() => {
                      setAccumulationMsg("");
                      patchBufferMutation.mutate();
                    }}
                  >
                    Save target
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1 text-xs"
                    disabled={
                      materializeBufferMutation.isPending ||
                      materializeScheduledMutation.isPending ||
                      !["manual_materialize_only", "snapshot_on_schedule"].includes(accumulationStrategyDraft)
                    }
                    onClick={() => {
                      setAccumulationMsg("");
                      materializeBufferMutation.mutate();
                    }}
                  >
                    Materialize now
                  </Button>
                  {accumulationStrategyDraft === "snapshot_on_schedule" ? (
                    <>
                      <label className="flex items-center gap-2">
                        <span className="whitespace-nowrap">Tick limit</span>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={scheduleTickLimit}
                          onChange={(e) => {
                            setAccumulationMsg("");
                            setScheduleTickLimit(e.target.value);
                          }}
                          className="w-24 appearance-none rounded-lg border border-border bg-muted px-2 py-2 text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        disabled={materializeScheduledMutation.isPending || materializeBufferMutation.isPending}
                        onClick={() => {
                          setAccumulationMsg("");
                          setScheduleTickResult(null);
                          materializeScheduledMutation.mutate();
                        }}
                      >
                        Run schedule tick
                      </Button>
                    </>
                  ) : null}
                </div>
                {accumulationMsg ? (
                  <p
                    className={`text-[11px] ${accumulationMsg.includes("saved") ? "text-emerald-400/90" : "text-amber-300/90"}`}
                  >
                    {accumulationMsg}
                  </p>
                ) : null}
                {scheduleTickResult ? (
                  <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-2 text-[11px]">
                    <div className="text-muted-foreground">
                      Last tick: checked={scheduleTickResult.checked}, materialized={scheduleTickResult.materialized_count},
                      skipped={scheduleTickResult.skipped.length}
                    </div>
                    {scheduleTickResult.materialized.length ? (
                      <div>
                        <div className="mb-1 font-semibold text-foreground">Materialized</div>
                        <div className="space-y-1">
                          {scheduleTickResult.materialized.slice(0, 8).map((row) => (
                            <div key={`${row.dataset_id}:${row.dataset_version_id}`} className="text-muted-foreground">
                              <span className="font-mono text-foreground">{row.dataset_id}</span> {"->"}{" "}
                              <span className="font-mono text-foreground">{row.version}</span>{" "}
                              (<span className="font-mono">{row.dataset_version_id.slice(0, 8)}…</span>)
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {scheduleTickResult.skipped.length ? (
                      <div>
                        <div className="mb-1 font-semibold text-foreground">Skipped</div>
                        <div className="space-y-1">
                          {scheduleTickResult.skipped.slice(0, 8).map((row, idx) => (
                            <div key={`${String(row.dataset_id || "na")}:${idx}`} className="text-muted-foreground">
                              <span className="font-mono text-foreground">{String(row.dataset_id || "unknown")}</span> ·{" "}
                              {String(row.reason || "skipped")}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-2 border-t border-border pt-3">
                <div>buffer_id: <span className="font-mono text-foreground">{String(bufferQuery.data.buffer_id || "—")}</span></div>
                <div>source_type: <span className="font-semibold text-foreground">{String(bufferQuery.data.source_type || "runtime_feedback")}</span></div>
                <div>accumulation_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.accumulation_strategy || "snapshot_on_threshold")}</span></div>
                <div>window_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.window_strategy || "threshold")}</span></div>
                <div>window_status: <span className="font-semibold text-foreground">{String(bufferQuery.data.window_status || "active")}</span></div>
                <div>materialization_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.materialization_strategy || "snapshot_on_threshold")}</span></div>
                <div>record_count: <span className="font-semibold text-foreground">{Number(bufferQuery.data.record_count ?? bufferQuery.data.current_size ?? 0)}</span></div>
                <div>progress: <span className="font-semibold text-foreground">{Number(bufferQuery.data.current_size || 0)} / {Number(bufferQuery.data.target_threshold || 0)}</span></div>
                <div>created_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.created_at || bufferQuery.data.started_at || ""))}</span></div>
                <div>last_ingested_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.last_ingested_at || bufferQuery.data.updated_at || ""))}</span></div>
                <div>last_materialized_version: <span className="font-mono text-foreground">{String(bufferQuery.data.last_materialized_version_id || "—")}</span></div>
                <div>last_materialized_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.last_materialized_at || ""))}</span></div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No active accumulation buffer yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "versions" ? (
        <Card>
          <CardHeader>
            <CardTitle>Dataset Versions</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTableShell>
              <DataTable className="text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Version</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Rows</th>
                    <th className="px-3 py-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(versionsQuery.data?.items || []).map((v) => (
                    <tr key={v.version_id} className="border-t border-border">
                      <td className="px-3 py-2">{v.version}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}>
                          {normalizeDatasetStatus(v.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const b = sourceTypeBadge(v.source_type);
                          return (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>
                              {b.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">{Number(v.record_count || 0)}</td>
                      <td className="px-3 py-2">{formatDateTimeCompact(v.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </DataTableShell>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "training" ? (
        <Card>
          <CardHeader>
            <CardTitle>Train model (intent)</CardTitle>
          </CardHeader>
          <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Uses <code className="rounded px-1 font-mono text-foreground">POST /runs/trigger</code> — resolves pipeline and
            base weights server-side.
          </p>
          <div className="mb-3">
            <label className="text-xs text-muted-foreground">Model</label>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="">— select model —</option>
              {(modelsQuery.data?.items || []).map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Pipeline:{" "}
            <span className="font-mono text-foreground">{effectivePipeline || "—"}</span>
            {resolvedPipelineQuery.data?.source ? (
              <span className="text-muted-foreground"> ({resolvedPipelineQuery.data.source})</span>
            ) : null}
          </div>
          <TrainingGateFields
            trainingMode={trainingMode}
            onTrainingModeChange={setTrainingMode}
            requiredSize={requiredSize}
            onRequiredSizeChange={setRequiredSize}
            className="mb-3"
          />
          {trainMsg ? <div className="mb-2 text-xs text-amber-300">{trainMsg}</div> : null}
          <DataTableShell>
            <DataTable className="text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {(versionsQuery.data?.items || []).map((v) => (
                  <tr
                    key={v.version_id}
                    className={`border-t border-border ${selectedVersionForReadiness === v.version_id ? "bg-secondary/40" : ""}`}
                    onClick={() => setSelectedVersionId(v.version_id)}
                  >
                    <td className="px-3 py-2">{v.version}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}
                      >
                        {normalizeDatasetStatus(v.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        className="px-3 py-1 text-xs"
                        disabled={
                          !selectedModelId ||
                          normalizeDatasetStatus(v.status) === "FAILED" ||
                          !pluginPrecheck.ok ||
                          pipelineVersionsQuery.isLoading
                        }
                        title={pluginPrecheck.ok ? "Train" : pluginPrecheck.reason}
                        onClick={async () => {
                          setTrainMsg("");
                          setSelectedVersionId(v.version_id);
                          try {
                            const scopedPid = normalizeProjectId(String(projectId || "").trim());
                            const runContext: Record<string, string> = {};
                            if (scopedPid.startsWith("clinic_")) {
                              runContext.clinic_id = scopedPid.slice("clinic_".length);
                            }
                            runContext.mlair_model_id = selectedModelId;
                            const res = await executeTrainingIntent(tenantId, projectId, token, {
                              kind: "model_dataset",
                              modelId: selectedModelId,
                              datasetId,
                              datasetVersionId: v.version_id,
                              idempotencyKey: `dataset-hub-train-${Date.now()}`,
                              trainingMode,
                              context: Object.keys(runContext).length ? runContext : undefined
                            });
                            if (res.run_id) router.push(`/runs/${res.run_id}`);
                          } catch (err) {
                            setTrainMsg(describeTrainError(err));
                          }
                        }}
                      >
                        Train
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {(versionsQuery.data?.items || []).length === 0 && !versionsQuery.isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">No versions yet.</p>
            ) : null}
          </DataTableShell>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "readiness" ? (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Readiness evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span />
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
                value={evaluationStatusFilter}
                onChange={(e) => setEvaluationStatusFilter(e.target.value)}
              >
                <option value="all">status: all</option>
                <option value="eligible">status: eligible</option>
                <option value="blocked">status: blocked</option>
              </select>
              <Button
                variant="secondary"
                onClick={() => setEvaluationPage((prev) => Math.max(0, prev - 1))}
                disabled={evaluationPage === 0 || readinessEvaluationsQuery.isLoading}
              >
                {"<<"}
              </Button>
              <span className="px-3 text-sm text-foreground">
                Page {evaluationPage + 1} / {maxEvaluationPage + 1}
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  if (evaluationPage < maxEvaluationPage) {
                    setEvaluationPage((prev) => prev + 1);
                    return;
                  }
                  if (!canLoadOlderEvaluations || readinessEvaluationsQuery.isLoading) return;
                  const nextPage = maxEvaluationPage + 1;
                  setMaxEvaluationPage(nextPage);
                  setEvaluationPage(nextPage);
                }}
                disabled={(!canLoadOlderEvaluations && evaluationPage === maxEvaluationPage) || readinessEvaluationsQuery.isLoading}
              >
                {">>"}
              </Button>
            </div>
          </div>
          <DataTableShell>
            <DataTable className="text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Current / Required</th>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Evaluated</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvaluationItems.map((row) => (
                  <tr key={row.evaluation_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          row.status === "eligible"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {String(row.status || "blocked").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {Number(row.current_size || 0)} / {Number(row.required_size || 0)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.dataset_version_id || "—"}
                    </td>
                    <td className="px-3 py-2">{formatDateTimeCompact(row.evaluated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {filteredEvaluationItems.length === 0 && !readinessEvaluationsQuery.isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">
                {evaluationItems.length === 0
                  ? evaluationPage === 0
                    ? "No readiness evaluations yet."
                    : "No older evaluations in this range."
                  : "No evaluations match this status filter."}
              </p>
            ) : null}
          </DataTableShell>
        </CardContent>
      </Card>
      ) : null}

    </RouteShell>
  );
}
