import { cn } from "@/lib/utils"

export type MetadataItem = {
  label: string
  value: React.ReactNode
  mono?: boolean
}

/** GitHub-style description list: label above value, subtle separators. */
export function MetadataList({ items, className }: { items: MetadataItem[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((item) => (
        <div key={item.label} className="space-y-1.5 py-5 first:pt-0 last:pb-0">
          <dt className="text-[13px] font-medium text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "text-sm leading-relaxed text-foreground break-words",
              item.mono && "font-mono text-[13px]",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
