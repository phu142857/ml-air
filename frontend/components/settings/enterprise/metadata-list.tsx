import { cn } from "@/lib/utils";

export type MetadataItem = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

export function MetadataList({ items, className }: { items: MetadataItem[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border/60", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(8rem,11rem)_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={cn("text-sm text-foreground break-all", item.mono && "font-mono text-xs")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
