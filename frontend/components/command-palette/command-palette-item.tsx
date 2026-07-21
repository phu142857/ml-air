"use client"

import { Pin, PinOff } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PaletteListEntry } from "@/lib/command-palette/types"
import { Button } from "@/components/ui/button"

function ShortcutBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded-md border border-border/80 bg-background/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

type CommandPaletteItemProps = {
  entry: PaletteListEntry
}

export function CommandPaletteItem({ entry }: CommandPaletteItemProps) {
  const Icon = entry.icon

  return (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium text-foreground">{entry.label}</div>
        {entry.sublabel ? (
          <div className="truncate text-xs text-muted-foreground">{entry.sublabel}</div>
        ) : null}
      </div>
      {entry.trailing}
      {entry.shortcut ? (
        <ShortcutBadge>{entry.shortcut}</ShortcutBadge>
      ) : null}
      {entry.pinnable && entry.onPinToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100 hover:opacity-100 focus-visible:opacity-100",
            entry.pinned && "opacity-100 text-primary",
          )}
          aria-label={entry.pinned ? "Unpin command" : "Pin command"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            entry.onPinToggle?.()
          }}
        >
          {entry.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </Button>
      ) : null}
    </>
  )
}

export function CommandPaletteEmpty({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
        <span className="font-mono text-sm text-muted-foreground">?</span>
      </div>
      <p className="text-sm font-medium text-foreground">No matches</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {query.trim()
          ? `Nothing matched “${query.trim()}”. Try a run ID, pipeline name, or trace ID.`
          : "Start typing to search runs, traces, datasets, and commands."}
      </p>
    </div>
  )
}

export function CommandPaletteLoading({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 text-xs text-muted-foreground">{label}</div>
  )
}
