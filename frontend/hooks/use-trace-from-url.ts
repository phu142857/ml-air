"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type Options = {
  enabled?: boolean
  onOpen: (traceId: string) => void
}

/** Open trace explorer from `?trace=<trace_id>`. Cleans query after handling. */
export function useTraceFromUrl({ enabled = true, onOpen }: Options) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!enabled) return

    const trace = (searchParams.get("trace") || "").trim()
    if (!trace) return

    onOpen(trace)

    const sp = new URLSearchParams(searchParams.toString())
    sp.delete("trace")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [enabled, searchParams, pathname, router, onOpen])
}
