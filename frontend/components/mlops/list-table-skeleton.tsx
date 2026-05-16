import { Skeleton } from "@/components/ui/skeleton"

interface ListTableSkeletonProps {
  rows?: number
}

export function ListTableSkeleton({ rows = 8 }: ListTableSkeletonProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden p-1 space-y-1">
      <Skeleton className="h-9 w-full bg-muted/60" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full bg-muted/40" />
      ))}
    </div>
  )
}
