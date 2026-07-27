"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchPipelineVersionsPage, type PipelineVersionItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";

const PIPELINE_VERSIONS_PAGE_SIZE = 20;

/** Pipeline config versions with cursor pagination. */
export function usePipelineVersionsList(pipelineId: string, enabled = true) {
  const { tenantId, projectId, token } = useAppContext();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.pipelines.versionsInfinite(tenantId, projectId, pipelineId),
    queryFn: ({ pageParam }) =>
      fetchPipelineVersionsPage(tenantId, projectId, pipelineId, token, {
        limit: PIPELINE_VERSIONS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(pipelineId && token?.trim()),
  });

  const items: PipelineVersionItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    pageSize: PIPELINE_VERSIONS_PAGE_SIZE,
  };
}
