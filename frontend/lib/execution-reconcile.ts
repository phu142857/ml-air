/**
 * Phase 3: periodic / post-reconnect snapshot invalidation for execution surfaces.
 */
import type { QueryClient } from "@tanstack/react-query";

import { mlairKeys } from "./query-keys";

/** Broad invalidation so React Query refetches authoritative DB snapshots. */
export function reconcileExecutionSnapshots(
  queryClient: QueryClient,
  tenantId: string,
  projectId: string,
): void {
  const keys: unknown[][] = [
    [...mlairKeys.runs.list(tenantId, projectId)],
    [...mlairKeys.pipelines.list(tenantId, projectId)],
    [...mlairKeys.execution.projection(tenantId, projectId)],
  ];
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: key, exact: false });
  }
}
