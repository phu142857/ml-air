import { Skeleton } from "@/components/ui/skeleton"

interface ListTableSkeletonProps {
  rows?: number
}

export function ListTableSkeleton({ rows = 8 }: ListTableSkeletonProps) {
  return (
    <div className="bezel-shell overflow-hidden">
      <div className="bezel-inner space-y-2 p-2">
        <Skeleton className="h-10 w-full rounded-lg bg-muted/60" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
