"use client"

import { cn } from "@/lib/utils"

interface PageScrollBodyProps {
  children: React.ReactNode
  className?: string
  /** Renders above the scroll region (banners, filters, forms). */
  header?: React.ReactNode
}

/**
 * Standard page content shell: fixed chrome + `scroll-region` for overflow.
 * Use on list/detail pages inside `flex min-h-0 flex-1 flex-col overflow-hidden` roots.
 */
export function PageScrollBody({ children, className, header }: PageScrollBodyProps) {
  return (
    <div className={cn("page-body", className)}>
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scroll-region">{children}</div>
      </div>
    </div>
  )
}
