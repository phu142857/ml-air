"use client"

import { ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getJaegerTraceUrl } from "@/lib/runtime-config"

interface JaegerLinkProps {
  traceId?: string | null
  variant?: "button" | "link"
  size?: "sm" | "default"
}

export function JaegerLink({ traceId, variant = "button", size = "sm" }: JaegerLinkProps) {
  if (!traceId) return null

  const url = getJaegerTraceUrl(traceId)

  const isConfigured = !!url
  const href = url ?? `#trace-${traceId}`

  if (variant === "link") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="link-primary inline-flex items-center gap-1.5 text-xs"
        onClick={(e) => {
          if (!isConfigured) {
            e.preventDefault()
            console.log("Jaeger not configured. TraceID:", traceId)
          }
        }}
      >
        <Search className="h-3 w-3" strokeWidth={1.75} />
        <span className="font-mono">{traceId.slice(0, 8)}...</span>
        <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
      </a>
    )
  }

  return (
    <Button
      variant="outline"
      size={size}
      asChild={isConfigured}
      className="gap-2 border-primary/30 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15"
    >
      {isConfigured ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          View in Jaeger
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
        </a>
      ) : (
        <span
          onClick={() => console.log("Jaeger not configured. TraceID:", traceId)}
          className="cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          View in Jaeger
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
        </span>
      )}
    </Button>
  )
}
