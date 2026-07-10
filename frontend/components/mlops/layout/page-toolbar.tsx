import { cn } from "@/lib/utils"

interface PageToolbarProps {
  children: React.ReactNode
  className?: string
}

export function PageToolbar({ children, className }: PageToolbarProps) {
  return (
    <div className={cn("page-toolbar", className)}>
      <div className="flex w-full items-center justify-between gap-4">
        {children}
      </div>
    </div>
  )
}
