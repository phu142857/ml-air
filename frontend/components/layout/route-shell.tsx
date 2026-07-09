"use client"

import { useState, useEffect, useCallback } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Topbar } from "./topbar"
import { CommandPalette } from "@/components/command-palette"
import { TraceExplorerDialog } from "@/components/mlops/trace-link"
import { TraceUrlSync } from "@/components/mlops/trace-url-sync"
import { useRealtimeStatusToasts } from "@/hooks/use-realtime-status-toasts"
import { useAppContext } from "@/lib/app-context"

interface RouteShellProps {
  children: React.ReactNode
}

export function RouteShell({ children }: RouteShellProps) {
  const [commandOpen, setCommandOpen] = useState(false)
  const [traceDialogId, setTraceDialogId] = useState<string | null>(null)
  const { tenantId, projectId } = useAppContext()
  const scopePinned = tenantId !== "all" && projectId !== "all"

  useRealtimeStatusToasts(scopePinned)

  const handleOpenTraceFromUrl = useCallback((traceId: string) => {
    setTraceDialogId(traceId)
  }, [])

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
      <SidebarInset className="relative flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background">
        <Topbar onOpenCommandPalette={() => setCommandOpen(true)} />
        <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <TraceUrlSync enabled={scopePinned} onOpen={handleOpenTraceFromUrl} />
      {traceDialogId ? (
        <TraceExplorerDialog
          traceId={traceDialogId}
          open={Boolean(traceDialogId)}
          onOpenChange={(next) => {
            if (!next) setTraceDialogId(null)
          }}
        />
      ) : null}
    </SidebarProvider>
  )
}
