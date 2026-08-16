"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KEYBOARD_SHORTCUT_GROUPS } from "@/lib/keyboard/nav-chords"

function ShortcutKeys({ keys }: { keys: string }) {
  const parts = keys.split(" ")
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, index) => (
        <kbd
          key={`${keys}-${index}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border/80 bg-muted/40 px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
        >
          {part}
        </kbd>
      ))}
    </span>
  )
}

export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Power-user navigation and command palette.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.keys + item.label}
                    className="interactive-row flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="text-sm text-foreground">{item.label}</span>
                    <ShortcutKeys keys={item.keys} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
