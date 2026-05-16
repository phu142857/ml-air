import { Skeleton } from "@/components/ui/skeleton"

interface DetailTabSkeletonProps {
  variant?: "grid" | "table" | "terminal" | "chart"
}

export function DetailTabSkeleton({ variant = "grid" }: DetailTabSkeletonProps) {
  if (variant === "terminal") {
    return (
      <div className="rounded-lg border border-border bg-background overflow-hidden space-y-0">
        <Skeleton className="h-9 w-full rounded-none bg-muted/60" />
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-4 mx-4 my-1.5 bg-muted/40" style={{ width: `${55 + (i % 4) * 10}%` }} />
        ))}
      </div>
    )
  }

  if (variant === "chart") {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4 h-64 flex flex-col gap-3">
        <Skeleton className="h-4 w-32 bg-muted/60" />
        <Skeleton className="flex-1 w-full bg-muted/40 rounded" />
      </div>
    )
  }

  if (variant === "table") {
    return (
      <div className="rounded-lg border border-border overflow-hidden space-y-1 p-1">
        <Skeleton className="h-9 w-full bg-muted/60" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-muted/35" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Skeleton className="h-40 rounded-lg bg-muted/80" />
      <Skeleton className="h-40 rounded-lg bg-muted/80" />
      <Skeleton className="h-32 rounded-lg bg-muted/40 lg:col-span-2" />
    </div>
  )
}
