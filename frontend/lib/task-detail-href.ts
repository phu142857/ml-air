import { taskIdPathSegment } from "@/lib/api"

/** Query params for task detail scope resolution (`tenant`, `project`, `run`). */
export type TaskScopeHint = {
  tenantId?: string
  projectId?: string
  runId?: string
}

export function parseTaskScopeHint(params: URLSearchParams): TaskScopeHint {
  const tenantId =
    params.get("tenant")?.trim() ||
    params.get("tenantId")?.trim() ||
    params.get("tenant_id")?.trim() ||
    undefined
  const projectId =
    params.get("project")?.trim() ||
    params.get("projectId")?.trim() ||
    params.get("project_id")?.trim() ||
    undefined
  const runId =
    params.get("run")?.trim() ||
    params.get("runId")?.trim() ||
    params.get("run_id")?.trim() ||
    undefined
  return { tenantId, projectId, runId }
}

export function taskScopeHintKey(hint?: TaskScopeHint): string {
  if (!hint) return ""
  return [hint.tenantId ?? "", hint.projectId ?? "", hint.runId ?? ""].join(":")
}

export function buildTaskDetailHref(
  taskId: string,
  scope?: { tenant_id?: string; project_id?: string; run_id?: string },
): string {
  const base = `/tasks/${taskIdPathSegment(taskId)}`
  if (!scope) return base
  const sp = new URLSearchParams()
  const tid = scope.tenant_id?.trim()
  const pid = scope.project_id?.trim()
  const runId = scope.run_id?.trim()
  if (tid && tid !== "all") sp.set("tenant", tid)
  if (pid && pid !== "all") sp.set("project", pid)
  if (runId) sp.set("run", runId)
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}
