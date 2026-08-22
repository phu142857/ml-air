"use client"

import { cn } from "@/lib/utils"

interface PageScrollBodyProps {
  children: React.ReactNode
  className?: string
  /** Renders above the scroll region (banners, filters, forms). */
  header?: React.ReactNode
  /** `workspace` fills the viewport below chrome (trace-style); `scroll` uses page scroll. */
  variant?: "scroll" | "workspace"
  /** When false, keep vertical padding/gap (dashboard widgets, multi-step forms). Default flush for list/detail canvases. */
  flush?: boolean
}

/**
 * Standard page content shell: fixed chrome + scroll or workspace region.
 * Use on list/detail pages inside `flex min-h-0 flex-1 flex-col overflow-hidden` roots.
 *
 * Scrollbars sit on the outer edge of the content column; panel content is inset
 * via `.scroll-region-pad` so they don’t touch.
 */
export function PageScrollBody({
  children,
  className,
  header,
  variant = "scroll",
  flush = true,
}: PageScrollBodyProps) {
  return (
    <div
      className={cn(
        flush ? "page-body-flush" : "page-body",
        variant === "workspace" && "min-h-0",
        className,
      )}
    >
      {header ? (
        <div className={cn("scroll-region-pad shrink-0", flush && "py-3")}>{header}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {variant === "workspace" ? (
          <div
            className={cn(
              "scroll-region-pad flex min-h-0 flex-1 flex-col overflow-hidden",
              flush ? "gap-0" : "gap-4",
            )}
          >
            {children}
          </div>
        ) : (
          <div className="scroll-region">
            <div
              className={cn(
                "scroll-region-pad flex flex-col",
                flush ? "gap-0 pb-0" : "gap-4 pb-4",
              )}
            >
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
