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
        "grid gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted-foreground mb-1">{item.label}</dt>
          <dd className={cn("text-sm text-foreground", item.mono && "font-mono text-xs")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
