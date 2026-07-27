"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchAuditTimeline, fetchAuditTimelinePage, fetchRuns } from "@/lib/api"
import { mapAuditTimelineItems, type AuditEvent } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { useToast } from "@/hooks/use-toast"
import { useDebouncedTrue } from "@/hooks/use-debounced-true"
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling"
import { normalizeStatus } from "@/lib/status-style"

export type LoadingState = "idle" | "loading" | "success" | "error"
export type ErrorType = "not-found" | "api-down" | null

export interface FetchState {
  status: LoadingState
  errorType: ErrorType
  error: Error | null
}

export interface LifecycleStats {
  total: number
  successCount: number
  failedCount: number
  warningCount: number
  withTraces: number
  tracePercent: number
}

export interface RecentTrace {
  id: string
  title: string
  status: string
  timestamp: string
  isNew: boolean
}

function parseApiErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: number }).status
    if (typeof s === "number") return s
  }
  const msg = String((err as Error)?.message || err || "")
  if (msg.includes("404")) return 404
  return undefined
}

interface UseLifecycleOptions {
  /** @deprecated Realtime WebSocket is primary; polling uses global fallback when WS is down. */
  livePollMs?: number
}

export function useLifecycle(_options: UseLifecycleOptions = {}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const poll = useRealtimeQueryPolling()
  const scopePinned = tenantId !== "all" && projectId !== "all"
  const enabled = Boolean(token?.trim())

  const [isLive, setIsLive] = useState(true)
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set())
  const prevIdsRef = useRef<Set<string>>(new Set())
  const hasSeededRef = useRef(false)

  const AUDIT_PAGE_SIZE = 100

  const infiniteLifecycleQuery = useInfiniteQuery({
    queryKey: mlairKeys.audit.timelineInfinite(tenantId, projectId),
    queryFn: async ({ pageParam }) => {
      const page = await fetchAuditTimelinePage(tenantId, projectId, token, {
        limit: AUDIT_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      })
      return {
        events: mapAuditTimelineItems(page.items),
        traceparent: page.traceparent,
        next_cursor: page.next_cursor,
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.next_cursor ? last.next_cursor : undefined),
    enabled: enabled && scopePinned,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: isLive && enabled && scopePinned ? poll.refetchInterval : false,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: 2,
  })

  const aggregateLifecycleQuery = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId),
    queryFn: async () => {
      const { items } = await fetchAuditTimeline(tenantId, projectId, token, {
        limit: AUDIT_PAGE_SIZE,
      })
      return {
        events: mapAuditTimelineItems(items),
      }
    },
    enabled: enabled && !scopePinned,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: isLive && enabled && !scopePinned ? poll.refetchInterval : false,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: 2,
  })

  const runsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
    staleTime: 20_000,
  })

  const events: AuditEvent[] = useMemo(() => {
    if (scopePinned) {
      return infiniteLifecycleQuery.data?.pages.flatMap((p) => p.events) ?? []
    }
    return Array.isArray(aggregateLifecycleQuery.data?.events)
      ? aggregateLifecycleQuery.data.events
      : []
  }, [scopePinned, infiniteLifecycleQuery.data?.pages, aggregateLifecycleQuery.data?.events])

  const isLoading =
    scopePinned
      ? infiniteLifecycleQuery.isLoading && events.length === 0
      : aggregateLifecycleQuery.isLoading && events.length === 0

  const isRefreshingRaw =
    scopePinned
      ? infiniteLifecycleQuery.isRefetching && events.length > 0
      : aggregateLifecycleQuery.isRefetching && events.length > 0

  const isRefreshing = useDebouncedTrue(isRefreshingRaw, 800)

  useEffect(() => {
    const data = events
    if (!Array.isArray(data) || data.length === 0) return
    const ids = new Set(data.map((e) => e.id))
    if (!hasSeededRef.current) {
      prevIdsRef.current = ids
      hasSeededRef.current = true
      return
    }
    const fresh = new Set<string>()
    for (const e of data) {
      if (!prevIdsRef.current.has(e.id)) fresh.add(e.id)
    }
    prevIdsRef.current = ids
    if (fresh.size === 0) return
    setNewEventIds((prev) => new Set([...prev, ...fresh]))
    const first = data.find((e) => fresh.has(e.id))
    if (first && isLive) {
      toast({
        title: "New lifecycle event",
        description: first.title,
        className: "bg-card border-border text-foreground",
      })
    }
  }, [events, isLive, toast])

  const errorType: ErrorType = useMemo(() => {
    if (scopePinned) {
      const err = infiniteLifecycleQuery.error
      if (!err) return null
    } else {
      const err = aggregateLifecycleQuery.error
      if (!err) return null
    }
    const err = scopePinned ? infiniteLifecycleQuery.error : aggregateLifecycleQuery.error
    const status = parseApiErrorStatus(err)
    if (status === 404) return "not-found"
    const msg = String((err as Error)?.message || "")
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) return "not-found"
    return "api-down"
  }, [scopePinned, infiniteLifecycleQuery.error, aggregateLifecycleQuery.error])

  const fetchState: FetchState = useMemo(
    () => ({
      status: isLoading
        ? "loading"
        : (scopePinned ? infiniteLifecycleQuery.isError : aggregateLifecycleQuery.isError)
          ? "error"
          : (scopePinned ? infiniteLifecycleQuery.isSuccess : aggregateLifecycleQuery.isSuccess)
            ? "success"
            : "idle",
      errorType,
      error: ((scopePinned ? infiniteLifecycleQuery.error : aggregateLifecycleQuery.error) as Error) ?? null,
    }),
    [
      isLoading,
      scopePinned,
      infiniteLifecycleQuery.isError,
      infiniteLifecycleQuery.isSuccess,
      infiniteLifecycleQuery.error,
      aggregateLifecycleQuery.isError,
      aggregateLifecycleQuery.isSuccess,
      aggregateLifecycleQuery.error,
      errorType,
    ],
  )

  const stats: LifecycleStats = useMemo(() => {
    const total = events.length
    const successCount = events.filter((e) => e.status === "success").length
    const failedCount = events.filter((e) => e.status === "failed").length
    const warningCount = events.filter((e) => e.severity === "warning" || e.severity === "error").length
    const withTraces = events.filter((e) => e.traceId).length
    return {
      total,
      successCount,
      failedCount,
      warningCount,
      withTraces,
      tracePercent: total > 0 ? Math.round((withTraces / total) * 100) : 0,
    }
  }, [events])

  const recentTraces: RecentTrace[] = useMemo(
    () =>
      events
        .filter((e) => e.traceId)
        .slice(0, 5)
        .map((e) => ({
          id: e.traceId!,
          title: e.title,
          status: e.status,
          timestamp: e.timestamp,
          isNew: newEventIds.has(e.id),
        })),
    [events, newEventIds],
  )

  const activeRunsCount = useMemo(() => {
    return (runsQuery.data?.items ?? []).filter((r) => normalizeStatus(r.status) === "RUNNING").length
  }, [runsQuery.data])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["audit-timeline", tenantId, projectId] })
    queryClient.invalidateQueries({ queryKey: mlairKeys.runs.list(tenantId, projectId), exact: false })
  }, [queryClient, tenantId, projectId])

  const toggleLive = useCallback(() => {
    setIsLive((prev) => {
      const next = !prev
      if (next) {
        toast({
          title: "Live updates enabled",
          description: "Timeline refreshes from the audit API on an interval.",
          className: "bg-card border-border text-foreground",
        })
      } else {
        toast({
          title: "Live updates disabled",
          description: "Timeline will no longer auto-refresh.",
          className: "bg-card border-border text-foreground",
        })
      }
      return next
    })
  }, [toast])

  return {
    events,
    stats,
    recentTraces,
    activeRunsCount,
    fetchState,
    isLoading,
    isRefreshing,
    isLive,
    newEventIds,
    scopePinned,
    refresh,
    toggleLive,
    fetchNextPage: scopePinned ? infiniteLifecycleQuery.fetchNextPage : undefined,
    hasNextPage: scopePinned ? infiniteLifecycleQuery.hasNextPage : false,
    isFetchingNextPage: scopePinned ? infiniteLifecycleQuery.isFetchingNextPage : false,
    loadedEventCount: events.length,
  }
}
