import { cn } from "@/lib/utils"

interface PageToolbarProps {
  children: React.ReactNode
  className?: string
}

export function PageToolbar({ children, className }: PageToolbarProps) {
  return (
    <div className={cn("page-toolbar", className)}>
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        {children}
      </div>
    </div>
  )
}
