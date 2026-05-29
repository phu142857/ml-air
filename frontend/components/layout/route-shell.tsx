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
      <SidebarInset className="relative flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background ambient-canvas">
        <div
          className="pointer-events-none fixed inset-0 z-[1] grain-overlay"
          aria-hidden
        />
        <Topbar onOpenCommandPalette={() => setCommandOpen(true)} />
        <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  )
}
