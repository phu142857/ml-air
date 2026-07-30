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
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background px-3 py-2 sm:px-4">
      <div className="flex h-12 items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-0.5 text-muted-foreground transition-default hover:text-foreground" />
          <div className="hidden h-5 w-px bg-border sm:block" />
          <ScopeSwitcher />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCommandPalette?.()}
            className="h-9 w-full max-w-[14rem] justify-start gap-2 rounded-lg border-border bg-muted/30 text-muted-foreground transition-default hover:border-border hover:bg-accent/40 hover:text-foreground sm:w-56 sm:max-w-none"
          >
            <Search strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm">Search</span>
            <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded-md border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="h-3 w-3" />
              K
            </kbd>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0 border-border bg-background text-muted-foreground transition-default hover:bg-accent/40 hover:text-foreground",
              settingsActive && "bg-accent text-foreground",
            )}
            asChild
          >
            <Link href="/settings/profile" aria-label="Settings" title="Settings">
              <Settings strokeWidth={1.75} className="h-4 w-4" />
            </Link>
          </Button>
          <RealtimeIndicator />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
