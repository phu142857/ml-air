import type { ClientValidationIssue, ClientValidationResult, NormalizedPipelineConfig } from "./types";

function isHttpTask(task: Record<string, unknown>): boolean {
  return String(task.type || "").trim().toLowerCase() === "http" || Boolean(task.http);
}

function detectCycle(taskIds: Set<string>, deps: Map<string, string[]>): string | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): string | null => {
    if (visiting.has(id)) return id;
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const dep of deps.get(id) || []) {
      const hit = dfs(dep);
      if (hit) return hit;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };

  for (const id of taskIds) {
    const hit = dfs(id);
    if (hit) return hit;
  }
  return null;
}

export function clientValidatePipelineConfig(config: NormalizedPipelineConfig): ClientValidationResult {
  const errors: ClientValidationIssue[] = [];
  const warnings: ClientValidationIssue[] = [];

  const tasks = config.tasks || [];
  if (!tasks.length) {
    errors.push({ level: "error", code: "NO_TASKS", message: "At least one task is required" });
    return { ok: false, errors, warnings };
  }

  const ids = new Set<string>();
  const deps = new Map<string, string[]>();

  for (const task of tasks) {
    const taskId = String(task.id || "").trim();
    if (!taskId) {
      errors.push({ level: "error", code: "MISSING_TASK_ID", message: "Every task must have an id" });
      continue;
    }
    if (ids.has(taskId)) {
      errors.push({
        level: "error",
        code: "DUPLICATE_TASK_ID",
        message: `Duplicate task id "${taskId}"`,
        taskId,
      });
    }
    ids.add(taskId);

    const raw = task as Record<string, unknown>;
    if (isHttpTask(raw)) {
      const http = raw.http;
      if (!http || typeof http !== "object") {
        errors.push({
          level: "error",
          code: "HTTP_TASK_MISSING_HTTP",
          message: `Task "${taskId}" is type http but has no http block`,
          taskId,
        });
      }
    } else {
      const plugin = String(task.plugin || "").trim();
      if (!plugin) {
        errors.push({
          level: "error",
          code: "MISSING_PLUGIN",
          message: `Task "${taskId}" must declare plugin (or type: http)`,
          taskId,
        });
      }
    }

    const dependsOn = Array.isArray(task.depends_on) ? task.depends_on.map((d) => String(d).trim()).filter(Boolean) : [];
    deps.set(taskId, dependsOn);
    for (const dep of dependsOn) {
      if (!ids.has(dep) && !tasks.some((t) => t.id === dep)) {
        // dep may appear later — second pass below
      }
    }
  }

  for (const task of tasks) {
    const taskId = task.id;
    for (const dep of deps.get(taskId) || []) {
      if (!ids.has(dep)) {
        errors.push({
          level: "error",
          code: "UNKNOWN_DEPENDENCY",
          message: `Task "${taskId}" depends on unknown task "${dep}"`,
          taskId,
        });
      }
    }
  }

  const cycleAt = detectCycle(ids, deps);
  if (cycleAt) {
    errors.push({
      level: "error",
      code: "CYCLE",
      message: `Dependency cycle detected (task "${cycleAt}")`,
      taskId: cycleAt,
    });
  }

  if (Array.isArray(config.inputs)) {
    for (const [i, inp] of config.inputs.entries()) {
      if (!inp || typeof inp !== "object") {
        errors.push({ level: "error", code: "INVALID_INPUT", message: `inputs[${i}] must be an object` });
        continue;
      }
      const dataset = String((inp as Record<string, unknown>).dataset || "").trim();
      if (!dataset) {
        errors.push({
          level: "error",
          code: "INPUT_MISSING_DATASET",
          message: `inputs[${i}] must include dataset name`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function unknownPlugins(
  config: NormalizedPipelineConfig,
  knownPluginNames: Set<string>,
): string[] {
  const unknown = new Set<string>();
  for (const task of config.tasks) {
    const raw = task as Record<string, unknown>;
    if (isHttpTask(raw)) continue;
    const plugin = String(task.plugin || "").trim();
    if (plugin && !knownPluginNames.has(plugin)) {
      unknown.add(plugin);
    }
  }
  return [...unknown].sort();
}

/** @deprecated Use unknownPlugins — kept for existing imports */
export function unknownRegistryPlugins(
  config: NormalizedPipelineConfig,
  registeredPluginNames: Set<string>,
): string[] {
  return unknownPlugins(config, registeredPluginNames);
}

export function parseServerValidateError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { detail?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
      if (Array.isArray(parsed.detail)) {
        return parsed.detail.map((d) => JSON.stringify(d)).join("; ");
      }
      return err.message;
    } catch {
      return err.message;
    }
  }
  return String(err);
}
