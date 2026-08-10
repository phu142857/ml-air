"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Command, Settings } from "lucide-react"
import { AccountMenu } from "@/components/layout/account-menu"
import { ScopeSwitcher } from "@/components/mlops/scope-switcher"
import { RealtimeIndicator } from "@/components/mlops/realtime-indicator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface TopbarProps {
  onOpenCommandPalette?: () => void
}

export function Topbar({ onOpenCommandPalette }: TopbarProps) {
  const pathname = usePathname()
  const settingsActive =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/identity" ||
    pathname.startsWith("/identity/")

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background px-3 py-1.5 sm:px-4">
      <div className="flex h-10 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-0.5 text-muted-foreground transition-default hover:text-foreground" />
          <div className="hidden h-4 w-px bg-border sm:block" />
          <ScopeSwitcher />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCommandPalette?.()}
            className="h-8 w-full max-w-[12rem] justify-start gap-2 rounded-md border-border bg-muted/30 px-2.5 text-muted-foreground transition-default hover:border-border hover:bg-accent/40 hover:text-foreground sm:w-48 sm:max-w-none"
          >
            <Search strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">Search</span>
            <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="h-3 w-3" />
              K
            </kbd>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 border-border bg-background text-muted-foreground transition-default hover:bg-accent/40 hover:text-foreground",
              settingsActive && "bg-accent text-foreground",
            )}
            asChild
          >
            <Link href="/settings/profile" aria-label="Settings" title="Settings">
              <Settings strokeWidth={1.75} className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <RealtimeIndicator />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
