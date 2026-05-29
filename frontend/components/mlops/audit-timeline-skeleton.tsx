"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface AuditTimelineSkeletonProps {
  count?: number
  className?: string
}

function TimelineItemSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-px bg-muted" />
      )}
      
      {/* Event icon skeleton */}
      <Skeleton className="relative z-10 h-10 w-10 shrink-0 rounded-full bg-muted" />
      
      {/* Event content skeleton */}
      <div className="flex-1 min-w-0">
        <div className="panel-surface p-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              {/* Title row */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-48 bg-muted" />
                <Skeleton className="h-5 w-16 rounded-full bg-muted" />
              </div>
              {/* Description */}
              <Skeleton className="h-3 w-72 bg-muted/70" />
            </div>
            
            {/* Timestamp and chevron */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <Skeleton className="h-3 w-24 bg-muted/80" />
                <Skeleton className="h-3 w-16 bg-muted/80" />
              </div>
              <Skeleton className="h-4 w-4 bg-muted/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuditTimelineSkeleton({ count = 5, className }: AuditTimelineSkeletonProps) {
  return (
    <div className={cn("relative animate-in fade-in duration-300", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <TimelineItemSkeleton key={index} isLast={index === count - 1} />
      ))}
    </div>
  )
}

// Stats cards skeleton
export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="bezel-shell rounded-xl border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-20 bg-muted" />
              <Skeleton className="h-7 w-12 bg-muted" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Sidebar skeleton
export function JaegerSidebarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Jaeger status card skeleton */}
      <div className="bezel-shell rounded-xl border-border/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 bg-muted" />
              <Skeleton className="h-4 w-24 bg-muted" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full bg-muted" />
          </div>
          <Skeleton className="h-3 w-40 bg-muted/70" />
          <Skeleton className="h-8 w-full rounded-md bg-muted" />
          <Skeleton className="h-8 w-full rounded-md bg-primary/10" />
        </div>
      </div>
      
      {/* Recent traces skeleton */}
      <div className="bezel-shell rounded-xl border-border/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 bg-muted" />
            <Skeleton className="h-4 w-24 bg-muted" />
          </div>
          <Skeleton className="h-3 w-44 bg-muted/70" />
          
          <div className="space-y-2 pt-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-md bg-background border border-border p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 rounded-full bg-muted" />
                  <Skeleton className="h-3 w-28 bg-muted" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-2.5 w-24 bg-muted/80" />
                  <Skeleton className="h-5 w-14 rounded bg-primary/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Trace analytics skeleton */}
      <div className="bezel-shell rounded-xl border-border/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 bg-muted" />
            <Skeleton className="h-4 w-28 bg-muted" />
          </div>
          
          <div className="space-y-2 pt-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <Skeleton className="h-3 w-24 bg-muted/80" />
                <Skeleton className="h-4 w-8 bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Full page skeleton combining all elements
export function LifecyclePageSkeleton() {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Page header skeleton */}
      <div className="border-b border-border/70 bg-background/60 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg bg-muted" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32 bg-muted" />
              <Skeleton className="h-3 w-56 bg-muted/70" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-md bg-primary/10" />
            <Skeleton className="h-8 w-20 rounded-md bg-muted" />
            <Skeleton className="h-8 w-20 rounded-md bg-muted" />
          </div>
        </div>
      </div>
      
      {/* Stats skeleton */}
      <div className="page-toolbar">
        <StatsCardsSkeleton />
      </div>
      
      {/* Filters toolbar skeleton */}
      <div className="page-toolbar">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-64 rounded-md bg-muted" />
            <Skeleton className="h-8 w-24 rounded-md bg-muted" />
            <Skeleton className="h-8 w-24 rounded-md bg-muted" />
            <Skeleton className="h-8 w-24 rounded-md bg-muted" />
          </div>
          <Skeleton className="h-4 w-36 bg-muted/80" />
        </div>
      </div>
      
      {/* Main content skeleton */}
      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          <div className="flex-1 p-6 overflow-auto">
            <AuditTimelineSkeleton count={6} />
          </div>
          <div className="w-80 border-l border-border surface-muted p-4 overflow-auto">
            <JaegerSidebarSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}
