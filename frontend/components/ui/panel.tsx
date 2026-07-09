import { cn } from "@/lib/utils"

export function Panel({
  children,
  className,
  interactive = false,
}: {
  children: React.ReactNode
  className?: string
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        "panel-surface p-5 sm:p-6 transition-default",
        interactive && "cursor-pointer hover:border-border",
        className,
      )}
    >
      {children}
    </div>
  )
}
