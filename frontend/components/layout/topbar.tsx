"use client"

import { Suspense, useState, useCallback, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search, Command } from "lucide-react"
import { ScopeSwitcher } from "@/components/mlops/scope-switcher"
import { RealtimeIndicator } from "@/components/mlops/realtime-indicator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface TopbarProps {
  onOpenCommandPalette?: () => void
}

function TopbarInner({ onOpenCommandPalette }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (pathname === "/search") {
      setQuery(searchParams.get("q") || "")
    }
  }, [pathname, searchParams])

  const submitSearch = useCallback(() => {
    const q = query.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}&type=all`)
    } else {
      onOpenCommandPalette?.()
    }
  }, [query, router, onOpenCommandPalette])

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800/50 bg-zinc-950/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1 text-zinc-400 hover:text-zinc-100" />
        <div className="h-4 w-px bg-zinc-800" />
        <ScopeSwitcher />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden w-72 sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submitSearch()
              }
            }}
            placeholder="Search runs, tasks, datasets…"
            className={cn(
              "h-8 w-full rounded-md border border-zinc-800 bg-zinc-900/50 py-1 pl-8 pr-[4.5rem] text-sm text-zinc-200",
              "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600",
            )}
            aria-label="Global search"
          />
          <button
            type="button"
            onClick={() => onOpenCommandPalette?.()}
            className="absolute right-1 top-1/2 flex h-6 -translate-y-1/2 items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-700"
            title="Command palette"
          >
            <Command className="h-3 w-3" />
            K
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpenCommandPalette?.()}
          className="flex h-8 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 sm:hidden"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        <RealtimeIndicator />
      </div>
    </header>
  )
}

export function Topbar(props: TopbarProps) {
  return (
    <Suspense
      fallback={
        <header className="sticky top-0 z-40 flex h-14 items-center border-b border-zinc-800/50 bg-zinc-950/80 px-4 backdrop-blur-sm" />
      }
    >
      <TopbarInner {...props} />
    </Suspense>
  )
}
