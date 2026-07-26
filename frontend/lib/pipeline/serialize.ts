import { dump as dumpYaml } from "js-yaml";
import type { NormalizedPipelineConfig } from "./types";

export function configToYaml(config: NormalizedPipelineConfig): string {
  const { tasks, inputs, ...rest } = config;
  const doc: Record<string, unknown> = { ...rest, tasks };
  if (inputs?.length) doc.inputs = inputs;
  return dumpYaml(doc, { lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd() + "\n";
}

export function configToJson(config: NormalizedPipelineConfig, pretty = true): string {
  return JSON.stringify(config, null, pretty ? 2 : 0) + "\n";
}
