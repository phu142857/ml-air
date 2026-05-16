import { ScopePinnedBanner } from "./scope-pinned-banner"

interface ScopePinnedInlineProps {
  message: string
  className?: string
}

/** Inline variant — use inside detail page body (e.g. task resolved via fan-out). */
export function ScopePinnedInline({ message, className }: ScopePinnedInlineProps) {
  return <ScopePinnedBanner variant="inline" message={message} className={className} />
}
