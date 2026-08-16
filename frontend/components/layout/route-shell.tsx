"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Topbar } from "./topbar"
import { CommandPalette } from "@/components/command-palette"
import { TraceExplorerDialog } from "@/components/mlops/trace-link"
import { TraceUrlSync } from "@/components/mlops/trace-url-sync"
import { PageTransition } from "@/components/mlops/interaction"
import { ShortcutHelpDialog } from "@/components/mlops/shortcut-help-dialog"
import { useAppContext } from "@/lib/app-context"
import { HubAuthGuard } from "@/components/auth/hub-auth-guard"
import { useAuthSessionWatch } from "@/hooks/use-auth-session-watch"
import { useScopeChangeRedirect } from "@/hooks/use-scope-change-redirect"
import { useNavChords } from "@/hooks/use-nav-chords"

interface RouteShellProps {
  children: React.ReactNode
}

function ScopeChangeRedirectListener() {
  useScopeChangeRedirect()
  return null
}

export function RouteShell({ children }: RouteShellProps) {
  const pathname = usePathname()
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [traceDialogId, setTraceDialogId] = useState<string | null>(null)
  const { tenantId, projectId } = useAppContext()
  const scopePinned = tenantId !== "all" && projectId !== "all"

  useAuthSessionWatch()
  useNavChords(useCallback(() => setShortcutHelpOpen(true), []))

  const handleOpenTraceFromUrl = useCallback((traceId: string) => {
    setTraceDialogId(traceId)
  }, [])

  // `/traces` owns `?trace=` for the inline viewer — don't open the global dialog there.
  const onTracesPage = pathname === "/traces" || pathname.startsWith("/traces/")
  const openTraceDialogFromUrl = scopePinned && !onTracesPage

  useEffect(() => {
    if (onTracesPage) setTraceDialogId(null)
  }, [onTracesPage])

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
    <HubAuthGuard>
      <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="relative flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background">
        <Topbar onOpenCommandPalette={() => setCommandOpen(true)} />
        <Suspense fallback={null}>
          <ScopeChangeRedirectListener />
        </Suspense>
        <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden">
          <PageTransition routeKey={pathname}>{children}</PageTransition>
        </div>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
      <TraceUrlSync enabled={openTraceDialogFromUrl} onOpen={handleOpenTraceFromUrl} />
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
    </HubAuthGuard>
  )
}
