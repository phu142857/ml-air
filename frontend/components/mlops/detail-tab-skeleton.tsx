import { Skeleton } from "@/components/ui/skeleton"

interface DetailTabSkeletonProps {
  variant?: "grid" | "table" | "terminal" | "chart"
}

function BezelSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="bezel-shell overflow-hidden">
      <div className="bezel-inner overflow-hidden">{children}</div>
    </div>
  )
}

export function DetailTabSkeleton({ variant = "grid" }: DetailTabSkeletonProps) {
  if (variant === "terminal") {
    return (
      <BezelSkeleton>
        <Skeleton className="h-9 w-full rounded-none bg-muted/60" />
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mx-4 my-1.5 h-4 bg-muted/40"
            style={{ width: `${55 + (i % 4) * 10}%` }}
          />
        ))}
      </BezelSkeleton>
    )
  }

  if (variant === "chart") {
    return (
      <BezelSkeleton>
        <div className="flex h-64 flex-col gap-3 p-4">
          <Skeleton className="h-4 w-32 bg-muted/60" />
          <Skeleton className="flex-1 w-full rounded-lg bg-muted/40" />
        </div>
      </BezelSkeleton>
    )
  }

  if (variant === "table") {
    return (
      <BezelSkeleton>
        <div className="space-y-2 p-2">
          <Skeleton className="h-9 w-full rounded-lg bg-muted/60" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg bg-muted/35" />
          ))}
        </div>
      </BezelSkeleton>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-40 rounded-2xl bg-muted/80" />
      <Skeleton className="h-40 rounded-2xl bg-muted/80" />
      <Skeleton className="h-32 rounded-2xl bg-muted/40 lg:col-span-2" />
    </div>
  )
}
