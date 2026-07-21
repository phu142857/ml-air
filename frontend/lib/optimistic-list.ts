import type { QueryClient, QueryKey } from "@tanstack/react-query"

type ListPayload<T> = {
  items: T[]
  errors?: unknown[]
  [key: string]: unknown
}

/**
 * Optimistically patch `items` in a list-shaped query cache entry.
 */
export function patchListQueryItem<T extends { name?: string; id?: string }>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  match: (item: T) => boolean,
  patch: (item: T) => T,
): ListPayload<T> | undefined {
  const previous = queryClient.getQueryData<ListPayload<T>>(queryKey)
  if (!previous?.items) return previous

  const next: ListPayload<T> = {
    ...previous,
    items: previous.items.map((item) => (match(item) ? patch(item) : item)),
  }
  queryClient.setQueryData(queryKey, next)
  return previous
}
