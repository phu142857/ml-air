"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { PolicyReadinessBlockDialog } from "@/components/mlops/policy-readiness-block-dialog";
import { ScopePinnedInline } from "@/components/mlops/layout";
import { SCOPE_AGGREGATE_DATASET_DETAIL } from "@/lib/scope-messages";
import {
  fetchModelResolvedPipeline,
  fetchModels,
  fetchPipelineVersions,
  fetchPipelines,
  putModelPipelineMapping,
  type DatasetTrainingPolicy,
  type DatasetVersionItem,
} from "@/lib/api";
import {
  assessMlairPolicyReadiness,
  assessPipelineInputsReadiness,
  type TrainGateBlock,
} from "@/lib/mlair-policy-readiness";
import { executeTrainingIntent } from "@/lib/training-intent";
import { describeTrainError } from "@/lib/describe-train-error";
import { toastError, toastSuccess } from "@/lib/toast-actions";
import { feedbackMessageClass, STATUS_CHIP_TEXT } from "@/lib/status-style";
import { mlairKeys } from "@/lib/query-keys";
import { pickLatestPipelineVersion } from "@/lib/pipeline-config";
import {
  PIPELINE_RESOLVE_AUTO,
  buildPipelineSelectOptions,
  effectivePipelineId,
  formatResolveSource,
  isPipelineManualOverride,
  pipelineIdOverrideForTrigger,
} from "@/lib/pipeline-resolve-selection";
import { cn } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";

type Props = {
  datasetId: string;
  tenantId: string;
  projectId: string;
  token: string;
  scopePinned: boolean;
  versions: DatasetVersionItem[];
  versionsLoading?: boolean;
  policyId?: string;
  trainingPolicies?: DatasetTrainingPolicy[];
  className?: string;
};

function buildRunContext(modelId?: string): Record<string, string> | undefined {
  const ctx: Record<string, string> = {};
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
  policyId,
  trainingPolicies = [],
  className,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [pipelinePick, setPipelinePick] = useState(PIPELINE_RESOLVE_AUTO);
  const [saveMappingOnTrain, setSaveMappingOnTrain] = useState(false);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [readinessBlock, setReadinessBlock] = useState<TrainGateBlock | null>(null);
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);

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

  const resolvedPipelineId = resolvedPipelineQuery.data?.pipeline_id || null;
  const effectivePipeline = effectivePipelineId(pipelinePick, resolvedPipelineId);
  const manualOverride = isPipelineManualOverride(pipelinePick, resolvedPipelineId);

  useEffect(() => {
    setPipelinePick(PIPELINE_RESOLVE_AUTO);
    setSaveMappingOnTrain(false);
  }, [selectedModelId]);

  const trainPipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, effectivePipeline),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, effectivePipeline, token),
    enabled: scopePinned && Boolean(effectivePipeline && token),
  });

  const saveMappingMutation = useMutation({
    mutationFn: (pipelineId: string) =>
      putModelPipelineMapping(tenantId, projectId, selectedModelId, token, { pipeline_id: pipelineId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, selectedModelId),
      });
    },
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
        label: `${formatVersionLabel(v.version)} · ${v.status || "—"}`,
      })),
    ],
    [versions, versionsLoading],
  );

  const pipelineOptions = useMemo(
    () => buildPipelineSelectOptions(pipelinesQuery.data?.items || [], resolvedPipelineQuery.data),
    [pipelinesQuery.data?.items, resolvedPipelineQuery.data],
  );

  const pipelineDropdownValue = useMemo(() => {
    if (pipelinePick === PIPELINE_RESOLVE_AUTO) {
      return resolvedPipelineId ? PIPELINE_RESOLVE_AUTO : "";
    }
    if (pipelineOptions.some((o) => o.value === pipelinePick)) {
      return pipelinePick;
    }
    return pipelinePick;
  }, [pipelinePick, pipelineOptions, resolvedPipelineId]);

  const pluginPrecheck = useMemo(() => {
    if (!effectivePipeline) {
      return {
        ok: false,
        reason: resolvedPipelineId
          ? "Select a pipeline"
          : "No resolved pipeline — pick one from the dropdown",
      };
    }
    const items = trainPipelineVersionsQuery.data?.items || [];
    if (!items.length) return { ok: false, reason: "Pipeline has no active version" };
    const latest = pickLatestPipelineVersion(items);
    if (!latest) return { ok: false, reason: "Pipeline has no active version" };
    const cfg = (latest.config || {}) as Record<string, unknown>;
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
  }, [effectivePipeline, resolvedPipelineId, trainPipelineVersionsQuery.data]);

  const selectedVersion = versions.find((v) => v.version_id === selectedVersionId);
  const versionFailed = selectedVersion && String(selectedVersion.status || "").toUpperCase() === "FAILED";
  const hasTrainingPolicy = trainingPolicies.length > 0;

  const canTrain =
    scopePinned &&
    selectedModelId &&
    selectedVersionId &&
    effectivePipeline &&
    hasTrainingPolicy &&
    !versionFailed &&
    pluginPrecheck.ok &&
    !trainPipelineVersionsQuery.isLoading &&
    !submitting;

  const pipelineGateContext = useMemo(() => {
    if (readinessBlock?.kind !== "not_ready") return null;
    if (!effectivePipeline?.trim()) return null;
    return { pipelineId: effectivePipeline, tenantId, projectId, token };
  }, [readinessBlock, effectivePipeline, tenantId, projectId, token]);

  const onPipelineChange = (next: string) => {
    if (!next) {
      setPipelinePick(PIPELINE_RESOLVE_AUTO);
      return;
    }
    setPipelinePick(next);
    if (next !== PIPELINE_RESOLVE_AUTO) {
      setSaveMappingOnTrain(false);
    }
  };

  const onSubmit = async () => {
    setMsg("");
    setReadinessBlock(null);
    const assessment = await assessMlairPolicyReadiness({
      tenantId,
      projectId,
      datasetId,
      token,
      datasetVersionId: selectedVersionId,
      policies: trainingPolicies,
      policyId,
      modelId: selectedModelId,
    });
    if (!assessment.ok) {
      setReadinessBlock(assessment.block);
      setReadinessDialogOpen(true);
      return;
    }

    const pipelineAssessment = await assessPipelineInputsReadiness({
      tenantId,
      projectId,
      pipelineId: effectivePipeline,
      token,
      datasetVersionId: selectedVersionId,
      policyId: assessment.policyId,
    });
    if (!pipelineAssessment.ok) {
      setReadinessBlock(pipelineAssessment.block);
      setReadinessDialogOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const overrideId = pipelineIdOverrideForTrigger(pipelinePick, resolvedPipelineId);
      if (saveMappingOnTrain && overrideId) {
        await saveMappingMutation.mutateAsync(overrideId);
      }

      const res = await executeTrainingIntent(tenantId, projectId, token, {
        kind: "model_dataset",
        modelId: selectedModelId,
        datasetId,
        datasetVersionId: selectedVersionId,
        policyId: assessment.policyId,
        pipelineIdOverride: overrideId,
        idempotencyKey: `hub-train-${Date.now()}`,
        overrideConfig: { policy_id: assessment.policyId },
        context: buildRunContext(selectedModelId),
      });
      if (res.run_id) {
        toastSuccess("Run started", res.run_id);
        router.push(`/runs/${encodeURIComponent(res.run_id)}`);
      }
    } catch (err) {
      const errMsg = describeTrainError(err);
      setMsg(errMsg);
      toastError("Run failed", errMsg);
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

  const latestConfigVersion = pickLatestPipelineVersion(trainPipelineVersionsQuery.data?.items ?? []);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Model
          <SelectDropdown
            value={selectedModelId}
            onChange={setSelectedModelId}
            options={modelOptions}
            className="mt-1"
            buttonClassName="panel-surface bg-muted/20 px-3 py-2 text-sm"
            aria-label="Model to train"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Dataset version
          <SelectDropdown
            value={selectedVersionId}
            onChange={setSelectedVersionId}
            options={versionOptions}
            className="mt-1"
            buttonClassName="panel-surface bg-muted/20 px-3 py-2 font-mono text-sm"
            aria-label="Dataset version"
          />
        </label>
      </div>

      <label className="block text-xs text-muted-foreground">
        Pipeline
        <SelectDropdown
          value={pipelineDropdownValue}
          onChange={onPipelineChange}
          options={pipelineOptions}
          className="mt-1"
          buttonClassName="panel-surface bg-muted/20 px-3 py-2 font-mono text-sm"
          aria-label="Training pipeline"
          disabled={!selectedModelId || resolvedPipelineQuery.isLoading}
          placeholder={
            resolvedPipelineQuery.isLoading ? "Resolving pipeline…" : "Select pipeline…"
          }
        />
      </label>

      <div className="panel-surface space-y-2 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {resolvedPipelineQuery.isLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Resolving default pipeline for model…
          </span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              <span>
                Effective:{" "}
                <span className="font-mono text-foreground">{effectivePipeline || "—"}</span>
              </span>
              {manualOverride ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                  manual override
                </span>
              ) : resolvedPipelineId ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  auto · {formatResolveSource(resolvedPipelineQuery.data?.source)}
                </span>
              ) : null}
            </div>
            {trainPipelineVersionsQuery.isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking pipeline config…
              </span>
            ) : latestConfigVersion ? (
              <span>
                Config version:{" "}
                <span className="font-mono text-foreground">
                  {formatVersionLabel(latestConfigVersion.version)}
                </span>
              </span>
            ) : null}
            {!pluginPrecheck.ok && effectivePipeline ? (
              <p className={cn("mt-1", STATUS_CHIP_TEXT.failed)}>{pluginPrecheck.reason}</p>
            ) : null}
          </>
        )}
      </div>

      {manualOverride ? (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={saveMappingOnTrain}
            onChange={(e) => setSaveMappingOnTrain(e.target.checked)}
          />
          <span>
            Save <span className="font-mono text-foreground">{effectivePipeline}</span> as default
            pipeline for this model
          </span>
        </label>
      ) : null}

      {msg ? <p className={feedbackMessageClass("failed")}>{msg}</p> : null}

      <PolicyReadinessBlockDialog
        open={readinessDialogOpen}
        onOpenChange={setReadinessDialogOpen}
        block={readinessBlock}
        datasetId={datasetId}
        intentLabel="Train with model"
        pipelineGateContext={pipelineGateContext}
      />

      <Button
        type="button"
        className="gap-2 bg-primary hover:bg-primary/90"
        disabled={!canTrain}
        title={
          !hasTrainingPolicy
            ? "Create a training policy on the Readiness tab"
            : pluginPrecheck.ok
              ? "Train model"
              : pluginPrecheck.reason
        }
        onClick={() => void onSubmit()}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Train model
      </Button>
    </div>
  );
}
