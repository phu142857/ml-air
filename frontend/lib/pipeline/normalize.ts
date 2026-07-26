import type { Pipeline } from "@/lib/pipeline-types";
import { inferStageTypeFromLabel } from "./infer-stage-type";
import type { NormalizedPipelineConfig, PipelineTaskConfig } from "./types";

const PIPELINE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/;

export function isValidPipelineId(pipelineId: string): boolean {
  return PIPELINE_ID_RE.test(pipelineId.trim());
}

export function normalizePipelineConfig(raw: unknown): NormalizedPipelineConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("config must be an object with a tasks array");
  }
  const obj = raw as Record<string, unknown>;
  const tasksRaw = obj.tasks;
  if (!Array.isArray(tasksRaw)) {
    throw new Error('config must include "tasks" as an array');
  }

  const tasks: PipelineTaskConfig[] = tasksRaw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`tasks[${index}] must be an object`);
    }
    const t = item as Record<string, unknown>;
    const id = String(t.id ?? "").trim();
    if (!id) {
      throw new Error(`tasks[${index}] is missing "id"`);
    }
    const depends = t.depends_on;
    const depends_on = Array.isArray(depends)
      ? depends.map((d) => String(d).trim()).filter(Boolean)
      : undefined;
    return {
      ...t,
      id,
      ...(depends_on?.length ? { depends_on } : {}),
    } as PipelineTaskConfig;
  });

  const inputs = Array.isArray(obj.inputs) ? obj.inputs : undefined;
  const rest: Record<string, unknown> = { ...obj };
  delete rest.tasks;
  delete rest.inputs;

  return {
    ...rest,
    ...(inputs ? { inputs } : {}),
    tasks,
  };
}

/** Build a read-only PipelineDAG preview from normalized config. */
export function configToPreviewPipeline(pipelineId: string, config: NormalizedPipelineConfig): Pipeline {
  const stages = config.tasks.map((task) => {
    const label = String(task.plugin || task.id).trim() || task.id;
    return {
      id: task.id,
      name: label,
      type: inferStageTypeFromLabel(label),
      status: "idle" as const,
      dependencies: Array.isArray(task.depends_on) ? [...task.depends_on] : [],
    };
  });

  return {
    id: pipelineId,
    name: pipelineId,
    version: "draft",
    status: "idle",
    stages: stages.length
      ? stages
      : [
          {
            id: "_empty",
            name: "No tasks",
            type: "transform",
            status: "idle",
            dependencies: [],
          },
        ],
  };
}
