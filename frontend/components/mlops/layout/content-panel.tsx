import { Panel } from "@/components/ui/panel"
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
    <Panel className={className}>
      <div
        className={cn(
          padding && "p-5 sm:p-6",
          innerClassName,
        )}
      >
        {children}
      </div>
    </Panel>
  )
}
