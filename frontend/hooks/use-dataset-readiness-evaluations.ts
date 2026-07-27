"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import {
  fetchDatasetReadinessEvaluationsPage,
  type DatasetReadinessEvaluationItem,
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const READINESS_EVALUATIONS_PAGE_SIZE = 20;

export type ReadinessEvaluationFilters = {
  status?: string;
  policyId?: string;
  source?: string;
};

/** Persisted readiness evaluations with cursor pagination (server-side filters). */
export function useDatasetReadinessEvaluations(
  datasetId: string,
  enabled: boolean,
  filters: ReadinessEvaluationFilters = {}
) {
  const { tenantId, projectId, token } = useAppContext();
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.datasets.readinessEvaluationsInfinite(
      tenantId,
      projectId,
      datasetId,
      filters
    ),
    queryFn: ({ pageParam }) =>
      fetchDatasetReadinessEvaluationsPage(tenantId, projectId, datasetId, token, {
        limit: READINESS_EVALUATIONS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
        status: filters.status,
        policyId: filters.policyId,
        source: filters.source,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(datasetId && token?.trim()),
    ...poll,
  });

  const items: DatasetReadinessEvaluationItem[] =
    query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    pageSize: READINESS_EVALUATIONS_PAGE_SIZE,
  };
}
