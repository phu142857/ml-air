import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type LoadingSpinnerProps = {
  className?: string
  label?: string
}

/** Spinner that respects prefers-reduced-motion (static glyph when reduced). */
export function LoadingSpinner({ className, label = "Loading" }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("motion-safe-spin h-4 w-4 text-muted-foreground", className)}
      aria-label={label}
      role="status"
    />
  )
}
