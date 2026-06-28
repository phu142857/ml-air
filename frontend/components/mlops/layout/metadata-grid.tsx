import { cn } from "@/lib/utils"

export interface MetadataItem {
  label: string
  value: React.ReactNode
  mono?: boolean
}

interface MetadataGridProps {
  items: MetadataItem[]
  columns?: 2 | 3 | 4
  className?: string
}

export function MetadataGrid({ items, columns = 2, className }: MetadataGridProps) {
  return (
    <dl
      className={cn(
        "grid min-w-0 gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5"
        >
          <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={cn(
              "min-w-0 text-sm text-foreground",
              item.mono && "font-mono text-xs tabular-nums",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
