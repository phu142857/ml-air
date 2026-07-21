/** Simple title strip (legacy / parity with ML-Air frontend). */
export function PageChrome({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 sm:px-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

export type { ResourceAccent } from "@/components/mlops/layout/resource-page-header"
export { ResourcePageHeader } from "@/components/mlops/layout/resource-page-header"
