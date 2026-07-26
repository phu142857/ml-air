import type { PipelineStageType } from "@/lib/pipeline-types";

export function inferStageTypeFromLabel(label: string): PipelineStageType {
  const l = label.toLowerCase();
  if (l.includes("ingest") || l.includes("load") || l.includes("extract") || l.includes("split")) return "ingest";
  if (l.includes("train") || l.includes("fit")) return "train";
  if (l.includes("valid") || l.includes("eval") || l.includes("score") || l.includes("gate")) return "validate";
  if (l.includes("deploy") || l.includes("publish")) return "deploy";
  return "transform";
}
