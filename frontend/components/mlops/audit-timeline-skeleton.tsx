"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface AuditTimelineSkeletonProps {
  count?: number
  className?: string
}

const RAIL = 28

function TimelineItemSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <li
      className="relative grid items-start gap-x-3"
      style={{ gridTemplateColumns: `${RAIL}px minmax(0, 1fr)` }}
    >
      {!isLast ? (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-border"
          style={{ left: RAIL / 2 - 0.5 }}
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none absolute top-0 w-px bg-border"
          style={{ left: RAIL / 2 - 0.5, height: 16 }}
          aria-hidden
        />
      )}

      <div className="relative z-10 flex justify-center">
        <Skeleton className="size-7 rounded-full" />
      </div>

      <div className="min-w-0 pb-6">
        <div className="w-full rounded-md border border-border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-14" />
          </div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-3/5 max-w-sm" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      </div>
    </li>
  )
}

export function AuditTimelineSkeleton({ count = 5, className }: AuditTimelineSkeletonProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="mb-3 grid items-center gap-x-3"
        style={{ gridTemplateColumns: `${RAIL}px minmax(0, 1fr)` }}
      >
        <div aria-hidden />
        <Skeleton className="h-3 w-20" />
      </div>
      <ul className="list-none">
        {Array.from({ length: count }).map((_, index) => (
          <TimelineItemSkeleton key={index} isLast={index === count - 1} />
        ))}
      </ul>
    </div>
  )
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-md border border-border bg-card px-3 py-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2 h-6 w-10" />
        </div>
      ))}
    </div>
  )
}

export function TraceSidebarSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex justify-between gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LifecyclePageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>

      <div className="page-toolbar shrink-0 space-y-3">
        <StatsCardsSkeleton />
        <Skeleton className="h-9 w-full max-w-xl rounded-md" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden px-4 py-4 sm:px-6 min-[1200px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="scroll-region min-h-0">
          <AuditTimelineSkeleton count={6} />
        </div>
        <div className="min-h-0 overflow-hidden rounded-md border border-border bg-card">
          <TraceSidebarSkeleton />
        </div>
      </div>
    </div>
  )
}
