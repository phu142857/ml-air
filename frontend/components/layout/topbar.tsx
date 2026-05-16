"use client"

import { Search, Command } from "lucide-react"
import { ScopeSwitcher } from "@/components/mlops/scope-switcher"
import { RealtimeIndicator } from "@/components/mlops/realtime-indicator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface TopbarProps {
  onOpenCommandPalette?: () => void
}

export function Topbar({ onOpenCommandPalette }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/80 bg-background/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground -ml-1" />
        <div className="h-4 w-px bg-border" />
        <ScopeSwitcher />
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenCommandPalette?.()}
          className="h-8 w-full max-w-[16rem] justify-start gap-2 border-border bg-muted/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground sm:w-64 sm:max-w-none"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">Search…</span>
          <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <Command className="h-3 w-3" />
            K
          </kbd>
        </Button>
        <RealtimeIndicator />
      </div>
    </header>
  )
}
