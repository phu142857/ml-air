"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchModelEvaluationsPage, type ModelEvaluationItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const EVALUATIONS_PAGE_SIZE = 20;

export type ModelEvaluationFilters = {
  version?: number;
  status?: string;
};

export function useModelEvaluations(
  modelId: string,
  enabled: boolean,
  filters: ModelEvaluationFilters = {},
) {
  const { tenantId, projectId, token } = useAppContext();
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.models.evaluationsInfinite(tenantId, projectId, modelId, filters),
    queryFn: ({ pageParam }) =>
      fetchModelEvaluationsPage(tenantId, projectId, modelId, token, {
        limit: EVALUATIONS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
        version: filters.version,
        status: filters.status,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(modelId && token?.trim()),
    ...poll,
  });

  const items: ModelEvaluationItem[] =
    query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    pageSize: EVALUATIONS_PAGE_SIZE,
  };
}
