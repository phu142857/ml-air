import { cn } from "@/lib/utils"

export function Panel({
  children,
  className,
  interactive = false,
  padded = true,
}: {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  /** When false, only the surface chrome is applied (for nested section layouts). */
  padded?: boolean
}) {
  return (
    <div
      className={cn(
        "panel-surface transition-default",
        padded && "p-4 sm:p-5",
        interactive && "cursor-pointer hover:border-border",
        className,
      )}
    >
      {children}
    </div>
  )
}
