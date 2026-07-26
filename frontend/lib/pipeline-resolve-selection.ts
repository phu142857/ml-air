/** Sentinel: use server-side resolve (mapping → latest model run). */
export const PIPELINE_RESOLVE_AUTO = "__mlair_resolve_auto__";

export function effectivePipelineId(
  pipelinePick: string,
  resolvedPipelineId: string | null | undefined,
): string {
  if (pipelinePick === PIPELINE_RESOLVE_AUTO) {
    return String(resolvedPipelineId || "").trim();
  }
  return String(pipelinePick || "").trim();
}

/** Send override only when the user picked a pipeline different from auto-resolve. */
export function pipelineIdOverrideForTrigger(
  pipelinePick: string,
  resolvedPipelineId: string | null | undefined,
): string | undefined {
  if (pipelinePick === PIPELINE_RESOLVE_AUTO || !pipelinePick.trim()) {
    return undefined;
  }
  const picked = pipelinePick.trim();
  const resolved = String(resolvedPipelineId || "").trim();
  if (resolved && picked === resolved) {
    return undefined;
  }
  return picked;
}

export function isPipelineManualOverride(
  pipelinePick: string,
  resolvedPipelineId: string | null | undefined,
): boolean {
  return pipelineIdOverrideForTrigger(pipelinePick, resolvedPipelineId) !== undefined;
}

export function formatResolveSource(source: string | undefined): string {
  const s = String(source || "").trim();
  if (!s || s === "unresolved") return "unresolved";
  if (s === "model_pipeline_mapping") return "mapping";
  if (s === "latest_model_run") return "latest run";
  return s;
}

export function buildPipelineSelectOptions(
  pipelines: Array<{ pipeline_id: string }>,
  resolved: { pipeline_id: string | null; source?: string } | null | undefined,
): Array<{ value: string; label: string }> {
  const resolvedId = String(resolved?.pipeline_id || "").trim();
  const sourceLabel = formatResolveSource(resolved?.source);

  if (!resolvedId) {
    return [
      { value: "", label: "Select pipeline…" },
      ...pipelines
        .filter((p) => Boolean(p.pipeline_id))
        .map((p) => ({ value: p.pipeline_id, label: p.pipeline_id })),
    ];
  }

  const others = pipelines
    .filter((p) => p.pipeline_id && p.pipeline_id !== resolvedId)
    .map((p) => ({ value: p.pipeline_id, label: p.pipeline_id }));

  return [
    { value: PIPELINE_RESOLVE_AUTO, label: `${resolvedId} (auto · ${sourceLabel})` },
    ...others,
  ];
}
