"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Box, GitBranch, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import { ScopePinnedInline } from "@/components/mlops/layout";
import { SCOPE_AGGREGATE_DATASET_DETAIL } from "@/lib/scope-messages";
import {
  fetchModelResolvedPipeline,
  fetchModels,
  fetchPipelineVersions,
  fetchPipelines,
  normalizeProjectId,
  type DatasetVersionItem,
} from "@/lib/api";
import { executeTrainingIntent } from "@/lib/training-intent";
import { describeTrainError } from "@/lib/describe-train-error";
import { mlairKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type ExecutionIntentMode = "model_dataset" | "pipeline_compat";

type Props = {
  datasetId: string;
  tenantId: string;
  projectId: string;
  token: string;
  scopePinned: boolean;
  versions: DatasetVersionItem[];
  versionsLoading?: boolean;
  className?: string;
};

function buildRunContext(projectId: string, modelId?: string): Record<string, string> | undefined {
  const scopedPid = normalizeProjectId(String(projectId || "").trim());
  const ctx: Record<string, string> = {};
  if (scopedPid.startsWith("clinic_")) {
    ctx.clinic_id = scopedPid.slice("clinic_".length);
  }
  if (modelId?.trim()) ctx.mlair_model_id = modelId.trim();
  return Object.keys(ctx).length ? ctx : undefined;
}

export function ExecutionIntentPanel({
  datasetId,
  tenantId,
  projectId,
  token,
  scopePinned,
  versions,
  versionsLoading,
  className,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ExecutionIntentMode>("model_dataset");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: scopePinned && Boolean(token?.trim()),
  });

  const pipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: scopePinned && Boolean(token?.trim()),
  });

  const resolvedPipelineQuery = useQuery({
    queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelResolvedPipeline(tenantId, projectId, selectedModelId, token),
    enabled: scopePinned && Boolean(selectedModelId && token),
  });

  const trainPipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, resolvedPipelineQuery.data?.pipeline_id || ""),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, resolvedPipelineQuery.data!.pipeline_id!, token),
    enabled: scopePinned && Boolean(resolvedPipelineQuery.data?.pipeline_id && token),
  });

  const runPipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, selectedPipelineId),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, selectedPipelineId, token),
    enabled: scopePinned && Boolean(selectedPipelineId && token),
  });

  const modelOptions = useMemo(
    () => [
      { value: "", label: "Select model…" },
      ...(modelsQuery.data?.items || []).map((m) => ({ value: m.model_id, label: m.name })),
    ],
    [modelsQuery.data?.items],
  );

  const versionOptions = useMemo(
    () => [
      { value: "", label: versionsLoading ? "Loading versions…" : "Select dataset version…" },
      ...versions.map((v) => ({
        value: v.version_id,
        label: `v${v.version} · ${v.status || "—"}`,
      })),
    ],
    [versions, versionsLoading],
  );

  const pipelineOptions = useMemo(() => {
    const items = pipelinesQuery.data?.items || [];
    const withVersions = items.filter((p) => p.pipeline_id);
    return [
      { value: "", label: "Select pipeline…" },
      ...withVersions.map((p) => ({
        value: p.pipeline_id,
        label: p.pipeline_id,
      })),
    ];
  }, [pipelinesQuery.data?.items]);

  const effectiveTrainPipeline = resolvedPipelineQuery.data?.pipeline_id || "";

  const pluginPrecheck = useMemo(() => {
    if (!effectiveTrainPipeline) return { ok: false, reason: "Select a model with a mapped pipeline" };
    const items = trainPipelineVersionsQuery.data?.items || [];
    if (!items.length) return { ok: false, reason: "Mapped pipeline has no active version" };
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
  }, [effectiveTrainPipeline, trainPipelineVersionsQuery.data]);

  const pipelineRunnable = useMemo(() => {
    if (!selectedPipelineId) return { ok: false, reason: "Select a pipeline" };
    const items = runPipelineVersionsQuery.data?.items || [];
    if (!items.length) return { ok: false, reason: "Pipeline has no version — sync or publish a config version first" };
    return { ok: true, reason: "" };
  }, [selectedPipelineId, runPipelineVersionsQuery.data]);

  const selectedVersion = versions.find((v) => v.version_id === selectedVersionId);
  const versionFailed = selectedVersion && String(selectedVersion.status || "").toUpperCase() === "FAILED";

  const canTrain =
    scopePinned &&
    selectedModelId &&
    selectedVersionId &&
    !versionFailed &&
    pluginPrecheck.ok &&
    !trainPipelineVersionsQuery.isLoading &&
    !submitting;

  const canRunPipeline =
    scopePinned && selectedPipelineId && pipelineRunnable.ok && !runPipelineVersionsQuery.isLoading && !submitting;

  const onSubmit = async () => {
    setMsg("");
    setSubmitting(true);
    try {
      if (mode === "model_dataset") {
        const res = await executeTrainingIntent(tenantId, projectId, token, {
          kind: "model_dataset",
          modelId: selectedModelId,
          datasetId,
          datasetVersionId: selectedVersionId,
          idempotencyKey: `hub-train-${Date.now()}`,
          trainingMode,
          context: buildRunContext(projectId, selectedModelId),
        });
        if (res.blocked_by_gate) {
          setMsg("Run was blocked by readiness gate. Check Readiness tab for audit history.");
          return;
        }
        if (res.run_id) router.push(`/runs/${encodeURIComponent(res.run_id)}`);
        return;
      }
      const res = await executeTrainingIntent(tenantId, projectId, token, {
        kind: "pipeline_compat",
        pipelineId: selectedPipelineId,
        datasetId,
        datasetVersionId: selectedVersionId || undefined,
        trainingMode,
        useLatestPipelineVersion: true,
        idempotencyKey: `hub-pipeline-run-${Date.now()}`,
        context: buildRunContext(projectId),
      });
      if (res.blocked_by_gate) {
        setMsg("Run was blocked by readiness gate.");
        return;
      }
      if (res.run_id) router.push(`/runs/${encodeURIComponent(res.run_id)}`);
    } catch (err) {
      setMsg(describeTrainError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!scopePinned) {
    return (
      <div className={className}>
        <ScopePinnedInline message={SCOPE_AGGREGATE_DATASET_DETAIL} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "model_dataset" ? "default" : "outline"}
          className={cn(
            "h-8 gap-2",
            mode === "model_dataset"
              ? "bg-violet-600 text-white hover:bg-violet-500"
              : "border-border bg-card text-foreground/90",
          )}
          onClick={() => setMode("model_dataset")}
        >
          <Box className="h-3.5 w-3.5" />
          Train with model
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "pipeline_compat" ? "default" : "outline"}
          className={cn(
            "h-8 gap-2",
            mode === "pipeline_compat"
              ? "bg-sky-600 text-white hover:bg-sky-500"
              : "border-border bg-card text-foreground/90",
          )}
          onClick={() => setMode("pipeline_compat")}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Run with pipeline
        </Button>
      </div>

      {mode === "model_dataset" ? (
        <p className="text-xs text-muted-foreground">
          Starts a training run using the model&apos;s mapped pipeline. Pipeline is resolved automatically — you cannot
          pick a different pipeline here.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Runs the selected pipeline explicitly. Use for ETL, maintenance DAGs, and operational workflows — not model
          training.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {mode === "model_dataset" ? (
          <label className="text-xs text-muted-foreground">
            Model
            <SelectDropdown
              value={selectedModelId}
              onChange={setSelectedModelId}
              options={modelOptions}
              className="mt-1"
              buttonClassName="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              aria-label="Model to train"
            />
          </label>
        ) : (
          <label className="text-xs text-muted-foreground">
            Pipeline
            <SelectDropdown
              value={selectedPipelineId}
              onChange={setSelectedPipelineId}
              options={pipelineOptions}
              className="mt-1"
              buttonClassName="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm"
              aria-label="Pipeline to run"
            />
          </label>
        )}
        <label className="text-xs text-muted-foreground">
          Dataset version {mode === "pipeline_compat" ? "(optional)" : ""}
          <SelectDropdown
            value={selectedVersionId}
            onChange={setSelectedVersionId}
            options={versionOptions}
            className="mt-1"
            buttonClassName="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm"
            aria-label="Dataset version"
          />
        </label>
      </div>

      {mode === "model_dataset" ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Resolved pipeline:{" "}
          <span className="font-mono text-foreground">{effectiveTrainPipeline || "—"}</span>
          {resolvedPipelineQuery.data?.source ? (
            <span className="text-muted-foreground"> ({resolvedPipelineQuery.data.source})</span>
          ) : null}
          {resolvedPipelineQuery.isLoading ? (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> resolving…
            </span>
          ) : null}
          {!pluginPrecheck.ok && effectiveTrainPipeline ? (
            <p className="mt-1 text-[color:var(--status-pending-fg)]">{pluginPrecheck.reason}</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {runPipelineVersionsQuery.isLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking pipeline versions…
            </span>
          ) : pipelineRunnable.ok ? (
            <span>
              Active config:{" "}
              <span className="font-mono text-foreground">
                v{runPipelineVersionsQuery.data?.items?.[0]?.version ?? "—"}
              </span>
            </span>
          ) : (
            <span className="text-[color:var(--status-pending-fg)]">{pipelineRunnable.reason}</span>
          )}
        </div>
      )}

      <TrainingGateFields
        trainingMode={trainingMode}
        onTrainingModeChange={setTrainingMode}
        requiredSize={requiredSize}
        onRequiredSizeChange={setRequiredSize}
      />

      {msg ? <p className="text-xs text-[color:var(--status-pending-fg)]">{msg}</p> : null}

      <Button
        type="button"
        className={cn(
          "gap-2",
          mode === "model_dataset"
            ? "bg-violet-600 hover:bg-violet-500"
            : "bg-sky-600 hover:bg-sky-500",
        )}
        disabled={mode === "model_dataset" ? !canTrain : !canRunPipeline}
        title={
          mode === "model_dataset"
            ? pluginPrecheck.ok
              ? "Train model"
              : pluginPrecheck.reason
            : pipelineRunnable.ok
              ? "Run pipeline"
              : pipelineRunnable.reason
        }
        onClick={() => void onSubmit()}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {mode === "model_dataset" ? "Train model" : "Run pipeline"}
      </Button>
    </div>
  );
}
