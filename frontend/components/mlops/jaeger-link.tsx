"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getJaegerTraceUrl } from "@/lib/runtime-config"

interface JaegerLinkProps {
  traceId?: string | null
  variant?: "button" | "link"
  size?: "sm" | "default"
  className?: string
}

function useJaegerTraceHref(traceId: string | null | undefined): string | null {
  const [, tick] = useState(0)

  useEffect(() => {
    const onUpdate = () => tick((n) => n + 1)
    window.addEventListener("mlair-runtime-config-updated", onUpdate)
    return () => window.removeEventListener("mlair-runtime-config-updated", onUpdate)
  }, [])

  if (!traceId?.trim()) return null
  return getJaegerTraceUrl(traceId)
}

export function JaegerLink({ traceId, variant = "button", size = "sm", className }: JaegerLinkProps) {
  const href = useJaegerTraceHref(traceId)
  if (!traceId || !href) return null

  const normalizedId = traceId.trim()

  if (variant === "link") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "link-primary inline-flex max-w-full min-w-0 items-center gap-1.5 whitespace-nowrap text-xs",
          className,
        )}
      >
        <Search className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        <span className="truncate font-mono">{normalizedId.slice(0, 8)}…</span>
      </a>
    )
  }

  const buttonClassName = cn(
    "h-8 shrink-0 gap-1.5 whitespace-nowrap border-border bg-card px-2.5 text-xs text-primary",
    "hover:border-primary/40 hover:bg-primary/10",
    className,
  )

  return (
    <Button variant="outline" size={size} asChild className={buttonClassName}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span>View in Jaeger</span>
      </a>
    </Button>
  )
}
