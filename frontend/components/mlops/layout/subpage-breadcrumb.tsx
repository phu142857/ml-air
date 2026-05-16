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
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1.5 px-6 py-2 border-b border-border/80 bg-background/30 text-xs", className)}>
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/80" aria-hidden />}
          {segment.href ? (
            <Link href={segment.href} className="text-sky-400 hover:text-sky-300 transition-colors">
              {segment.label}
            </Link>
          ) : (
            <span className={cn(segment.mono ? "font-mono text-foreground/90" : "text-muted-foreground")}>
              {segment.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
