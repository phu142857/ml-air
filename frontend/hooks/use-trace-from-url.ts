"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type Options = {
  enabled?: boolean
  onOpen: (traceId: string) => void
}

/**
 * Open trace explorer dialog from `?trace=<trace_id>` on non-viewer routes.
 * Skips `/traces` (inline Trace Viewer owns that query). Cleans query after handling.
 */
export function useTraceFromUrl({ enabled = true, onOpen }: Options) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!enabled) return
    // Trace viewer page uses `?trace=` as shareable state — do not hijack into a dialog.
    if (pathname === "/traces" || pathname.startsWith("/traces/")) return

    const trace = (searchParams.get("trace") || "").trim()
    if (!trace) return

    onOpen(trace)

    const sp = new URLSearchParams(searchParams.toString())
    sp.delete("trace")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [enabled, searchParams, pathname, router, onOpen])
}
