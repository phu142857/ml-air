"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchAuditTimeline, fetchAuditTimelinePage, fetchRuns } from "@/lib/api"
import { mapAuditTimelineItems, type AuditEvent } from "@/lib/audit-event"
import { jaegerTraceDeepLink } from "@/lib/jaeger-trace-url"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { useToast } from "@/hooks/use-toast"
import { normalizeStatus } from "@/lib/status-style"

export type LoadingState = "idle" | "loading" | "success" | "error"
export type ErrorType = "not-found" | "api-down" | null

export interface FetchState {
  status: LoadingState
  errorType: ErrorType
  error: Error | null
}

export interface JaegerStatus {
  connected: boolean
  version: string
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
  jaegerUrl?: string
  /** Poll interval when live mode is on (ms). */
  livePollMs?: number
}

export function useLifecycle(options: UseLifecycleOptions = {}) {
  const { jaegerUrl = "", livePollMs = 15_000 } = options
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
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
        has_more: page.has_more,
        next_cursor: page.next_cursor,
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: isLive && enabled && scopePinned ? livePollMs : false,
    retry: 2,
  })

  const aggregateLifecycleQuery = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId),
    queryFn: async () => {
      const { items, traceparent } = await fetchAuditTimeline(tenantId, projectId, token, {
        limit: AUDIT_PAGE_SIZE,
      })
      return {
        events: mapAuditTimelineItems(items),
        traceparent,
      }
    },
    enabled: enabled && !scopePinned,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: isLive && enabled && !scopePinned ? livePollMs : false,
    retry: 2,
  })

  const runsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
    staleTime: 20_000,
  })

  const jaegerQuery = useQuery({
    queryKey: mlairKeys.jaegerStatus(jaegerUrl || "default"),
    queryFn: async (): Promise<JaegerStatus> => {
      const url = jaegerUrl.trim()
      if (!url) return { connected: false, version: "" }
      return { connected: true, version: "" }
    },
    staleTime: 60_000,
    retry: 0,
  })

  const events: AuditEvent[] = useMemo(() => {
    if (scopePinned) {
      return infiniteLifecycleQuery.data?.pages.flatMap((p) => p.events) ?? []
    }
    return Array.isArray(aggregateLifecycleQuery.data?.events)
      ? aggregateLifecycleQuery.data.events
      : []
  }, [scopePinned, infiniteLifecycleQuery.data?.pages, aggregateLifecycleQuery.data?.events])

  const traceparent = scopePinned
    ? (infiniteLifecycleQuery.data?.pages[0]?.traceparent ?? null)
    : (aggregateLifecycleQuery.data?.traceparent ?? null)

  const auditFetchJaegerUrl = useMemo(
    () => jaegerTraceDeepLink(jaegerUrl, traceparent),
    [jaegerUrl, traceparent],
  )

  const isLoading =
    scopePinned
      ? infiniteLifecycleQuery.isLoading && events.length === 0
      : aggregateLifecycleQuery.isLoading && events.length === 0

  const isRefreshing =
    scopePinned
      ? infiniteLifecycleQuery.isFetching && events.length > 0
      : aggregateLifecycleQuery.isFetching && events.length > 0

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
        title: "New update",
        description: first.title,
        className: "bg-card border-border text-foreground",
      })
    }
    const t = setTimeout(() => {
      setNewEventIds((prev) => {
        const next = new Set(prev)
        for (const id of fresh) next.delete(id)
        return next
      })
    }, 2500)
    return () => clearTimeout(t)
  }, [events, isLive, toast])

  const errorType: ErrorType = useMemo(() => {
    const err = scopePinned ? infiniteLifecycleQuery.error : aggregateLifecycleQuery.error
    if (!err) return null
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
    if (jaegerUrl.trim()) {
      queryClient.invalidateQueries({ queryKey: mlairKeys.jaegerStatus(jaegerUrl) })
    }
  }, [queryClient, tenantId, projectId, jaegerUrl])

  const refreshJaeger = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: mlairKeys.jaegerStatus(jaegerUrl || "default") })
  }, [queryClient, jaegerUrl])

  const toggleLive = useCallback(() => {
    setIsLive((prev) => {
      const next = !prev
      if (next) {
        toast({
          title: "Live updates enabled",
          description: "Timeline refreshes from the audit API on an interval.",
          className: "bg-card border-border text-foreground",
        })
      }
      return next
    })
  }, [toast])

  return {
    events,
    jaegerStatus: jaegerQuery.data ?? null,
    stats,
    recentTraces,
    activeRunsCount,
    fetchState,
    isLoading,
    isRefreshing,
    isLive,
    newEventIds,
    jaegerUrl,
    scopePinned,
    refresh,
    refreshJaeger,
    toggleLive,
    auditFetchJaegerUrl,
    fetchNextPage: scopePinned ? infiniteLifecycleQuery.fetchNextPage : undefined,
    hasNextPage: scopePinned ? infiniteLifecycleQuery.hasNextPage : false,
    isFetchingNextPage: scopePinned ? infiniteLifecycleQuery.isFetchingNextPage : false,
    loadedEventCount: events.length,
  }
}
