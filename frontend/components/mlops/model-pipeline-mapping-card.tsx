"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import {
  fetchModelResolvedPipeline,
  fetchPipelines,
  putModelPipelineMapping,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatResolveSource } from "@/lib/pipeline-resolve-selection";
import { toastError, toastSuccess } from "@/lib/toast-actions";
import { cn } from "@/lib/utils";
import { STATUS_CHIP_TEXT } from "@/lib/status-style";

type Props = {
  tenantId: string;
  projectId: string;
  modelId: string;
  token: string;
  className?: string;
};

export function ModelPipelineMappingCard({ tenantId, projectId, modelId, token, className }: Props) {
  const queryClient = useQueryClient();
  const [draftPipelineId, setDraftPipelineId] = useState("");

  const resolvedQuery = useQuery({
    queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, modelId),
    queryFn: () => fetchModelResolvedPipeline(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
  });

  const pipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  });

  const mappedId = resolvedQuery.data?.source === "model_pipeline_mapping"
    ? String(resolvedQuery.data.pipeline_id || "")
    : "";
  const resolvedId = String(resolvedQuery.data?.pipeline_id || "").trim();
  const resolvedSource = formatResolveSource(resolvedQuery.data?.source);

  useEffect(() => {
    setDraftPipelineId(mappedId || resolvedId || "");
  }, [mappedId, resolvedId, modelId]);

  const pipelineOptions = useMemo(() => {
    const items = pipelinesQuery.data?.items || [];
    return [
      { value: "", label: "Select pipeline…" },
      ...items
        .filter((p) => Boolean(p.pipeline_id))
        .map((p) => ({ value: p.pipeline_id, label: p.pipeline_id })),
    ];
  }, [pipelinesQuery.data?.items]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draftPipelineId.trim()) {
        throw new Error("Select a pipeline to save as default mapping");
      }
      return putModelPipelineMapping(tenantId, projectId, modelId, token, {
        pipeline_id: draftPipelineId.trim(),
      });
    },
    onSuccess: async () => {
      toastSuccess("Pipeline mapping saved", draftPipelineId.trim());
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, modelId),
      });
    },
    onError: (e: Error) => toastError("Save failed", e.message),
  });

  const dirty = draftPipelineId.trim() !== (mappedId || "");

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Default training pipeline</h3>
      </div>
      {resolvedQuery.isLoading ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Resolving…
        </span>
      ) : (
        <>
          <div className="mb-2 text-xs text-muted-foreground">
            Resolved now:{" "}
            <span className="font-mono text-foreground">{resolvedId || "—"}</span>
            {resolvedQuery.data?.source ? (
              <span className="text-muted-foreground"> ({resolvedSource})</span>
            ) : null}
            {!resolvedId ? (
              <p className={cn("mt-1", STATUS_CHIP_TEXT.failed)}>
                No pipeline yet — set a mapping or train once from a pipeline run.
              </p>
            ) : null}
          </div>
          <label className="block text-xs text-muted-foreground">
            Mapping (persisted)
            <SelectDropdown
              value={draftPipelineId}
              onChange={setDraftPipelineId}
              options={pipelineOptions}
              className="mt-1"
              buttonClassName="panel-surface bg-muted/20 px-3 py-2 font-mono text-sm"
              aria-label="Default pipeline mapping"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 border-border"
            disabled={!dirty || saveMutation.isPending || !draftPipelineId.trim()}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save mapping
          </Button>
        </>
      )}
    </div>
  );
}
