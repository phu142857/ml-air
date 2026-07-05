import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbSegment {
  label: string
  href?: string
  mono?: boolean
}

interface SubpageBreadcrumbProps {
  segments: BreadcrumbSegment[]
  className?: string
}

export function SubpageBreadcrumb({ segments, className }: SubpageBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border/70 bg-background/50 px-4 py-2.5 text-xs backdrop-blur-sm sm:px-6",
        className,
      )}
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && (
            <ChevronRight
              strokeWidth={1.75}
              className="h-3 w-3 shrink-0 text-muted-foreground/80"
              aria-hidden
            />
          )}
          {segment.href ? (
            <Link href={segment.href} className="link-primary shrink-0">
              {segment.label}
            </Link>
          ) : (
            <span
              className={cn(
                "min-w-0 truncate",
                segment.mono
                  ? "max-w-[min(100%,14rem)] font-mono text-foreground/90 sm:max-w-xs"
                  : "text-muted-foreground",
              )}
              title={segment.mono ? segment.label : undefined}
            >
              {segment.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
