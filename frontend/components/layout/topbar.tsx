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
    <header className="sticky top-0 z-30 shrink-0 px-3 pb-2 pt-3 sm:px-4">
      <div className="glass-panel flex h-12 items-center justify-between rounded-2xl px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-0.5 text-muted-foreground transition-premium hover:text-foreground" />
          <div className="hidden h-5 w-px bg-border/80 sm:block" />
          <ScopeSwitcher />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCommandPalette?.()}
            className="h-9 w-full max-w-[14rem] justify-start gap-2 rounded-xl border-border/70 bg-muted/30 text-muted-foreground transition-premium hover:border-border hover:bg-accent/40 hover:text-foreground active:scale-[0.98] sm:w-56 sm:max-w-none"
          >
            <Search strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm">Search</span>
            <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded-md border border-border/80 bg-background/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="h-3 w-3" />
              K
            </kbd>
          </Button>
          <RealtimeIndicator />
        </div>
      </div>
    </header>
  )
}
