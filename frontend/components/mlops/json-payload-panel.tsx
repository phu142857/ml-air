"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface JsonPayloadPanelProps {
  title?: string
  data: Record<string, unknown>
  className?: string
}

export function JsonPayloadPanel({ title = "Raw payload", data, className }: JsonPayloadPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("rounded-lg border border-border bg-background/60 overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground/90 hover:bg-card/80"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && (
        <pre className="border-t border-border p-4 text-xs font-mono text-muted-foreground overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
