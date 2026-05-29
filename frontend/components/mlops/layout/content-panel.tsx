import { cn } from "@/lib/utils"

interface ContentPanelProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  padding?: boolean
}

export function ContentPanel({
  children,
  className,
  innerClassName,
  padding = true,
}: ContentPanelProps) {
  return (
    <div className={cn("bezel-shell", className)}>
      <div
        className={cn(
          "bezel-inner",
          padding && "p-5 sm:p-6",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
