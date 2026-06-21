import type { RunItem, TaskItem } from "./api";

export function updatedAtMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Prefer the source with the newer `updated_at` so stale WS store rows cannot clobber API refetches. */
export function mergeRunListRow(queryRow: RunItem, live: RunItem): RunItem {
  const queryMs = updatedAtMs(queryRow.updated_at || queryRow.created_at);
  const liveMs = updatedAtMs(live.updated_at);
  if (liveMs <= queryMs) return queryRow;
  return {
    ...queryRow,
    ...live,
    status: live.status ?? queryRow.status,
    updated_at: live.updated_at ?? queryRow.updated_at,
    pipeline_id: live.pipeline_id || queryRow.pipeline_id,
    tenant_id: live.tenant_id || queryRow.tenant_id,
    project_id: live.project_id || queryRow.project_id,
  };
}

export function mergeTaskListRow<T extends TaskItem>(queryRow: T, live: TaskItem): T {
  const queryMs = updatedAtMs(queryRow.updated_at);
  const liveMs = updatedAtMs(live.updated_at);
  if (liveMs <= queryMs) return queryRow;
  return {
    ...queryRow,
    ...live,
    status: live.status ?? queryRow.status,
    updated_at: live.updated_at ?? queryRow.updated_at,
    attempt: live.attempt ?? queryRow.attempt,
  };
}
