import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type WidgetSkeletonProps = {
  lines?: number
  className?: string
}

/** Compact widget loading placeholder (dashboard cards, panels). */
export function WidgetSkeleton({ lines = 3, className }: WidgetSkeletonProps) {
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading content"
    >
      <Skeleton className="h-7 w-24 rounded-md" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  )
}
