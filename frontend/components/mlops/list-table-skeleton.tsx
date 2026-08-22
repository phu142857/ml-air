import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

interface ListTableSkeletonProps {
  rows?: number
  variant?: "panel" | "flat"
}

export function ListTableSkeleton({ rows = 8, variant = "flat" }: ListTableSkeletonProps) {
  const body = (
    <div
      className={cn(variant === "flat" ? "flex flex-col" : "space-y-2 p-2")}
      role="status"
      aria-busy="true"
      aria-label="Loading table"
    >
      {variant === "flat" ? (
        <>
          <div className="border-b border-border/40 py-2.5">
            <Skeleton className="h-8 w-full max-w-xs rounded-md" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="border-b border-border/20 py-3">
              <Skeleton className="h-4 w-full max-w-md rounded-md" />
            </div>
          ))}
        </>
      ) : (
        <>
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </>
      )}
    </div>
  )

  if (variant === "flat") return body
  return <Panel>{body}</Panel>
}
