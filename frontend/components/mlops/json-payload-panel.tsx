"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

interface JsonPayloadPanelProps {
  title?: string
  data: Record<string, unknown>
  className?: string
}

export function JsonPayloadPanel({ title = "Raw payload", data, className }: JsonPayloadPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <Panel className={className}>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 px-1 py-2 text-left text-sm font-semibold tracking-tight text-foreground transition-default hover:bg-muted/30"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          )}
          {title}
        </button>
        {open && (
          <pre className="max-h-64 overflow-auto border-t border-border/60 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </Panel>
  )
}
