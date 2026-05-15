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
  
  // If no Jaeger URL configured, show disabled state or fallback
  const isConfigured = !!url
  const href = url ?? `#trace-${traceId}`

  if (variant === "link") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
        onClick={(e) => {
          if (!isConfigured) {
            e.preventDefault()
            console.log("Jaeger not configured. TraceID:", traceId)
          }
        }}
      >
        <Search className="h-3 w-3" />
        <span className="font-mono">{traceId.slice(0, 8)}...</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    )
  }

  return (
    <Button
      variant="outline"
      size={size}
      asChild={isConfigured}
      className="gap-2 bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 hover:border-sky-500/40"
    >
      {isConfigured ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Search className="h-3.5 w-3.5" />
          View in Jaeger
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span
          onClick={() => console.log("Jaeger not configured. TraceID:", traceId)}
          className="cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          View in Jaeger
          <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </Button>
  )
}
