/** Simple title strip (legacy / parity with ML-Air frontend). */
export function PageChrome({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border bg-background/50 px-6 py-4">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
}

export type { ResourceAccent } from "@/components/mlops/layout/resource-page-header"
export { ResourcePageHeader } from "@/components/mlops/layout/resource-page-header"
