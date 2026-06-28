import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"

interface ListTableSkeletonProps {
  rows?: number
}

export function ListTableSkeleton({ rows = 8 }: ListTableSkeletonProps) {
  return (
    <Panel>
      <div className="space-y-2 p-2">
        <Skeleton className="h-10 w-full rounded-lg bg-muted/60" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg bg-muted/40" />
        ))}
      </div>
    </Panel>
  )
}
