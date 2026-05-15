"use client"

import { useState, useEffect, useCallback } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Topbar } from "./topbar"
import { CommandPalette } from "@/components/command-palette"

interface RouteShellProps {
  children: React.ReactNode
}

export function RouteShell({ children }: RouteShellProps) {
  const [commandOpen, setCommandOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setCommandOpen((open) => !open)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen bg-zinc-950">
        <Topbar onOpenCommandPalette={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  )
}
