"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type TriggerRunUrlIntent = {
  pipelineId?: string
  mode: "simple" | "gated"
}

type Options = {
  enabled?: boolean
  onOpen: (intent: TriggerRunUrlIntent) => void
}

function parseTriggerMode(trigger: string | null): "simple" | "gated" | null {
  if (!trigger) return null
  const t = trigger.toLowerCase()
  if (t === "gated" || t === "gate") return "gated"
  if (t === "1" || t === "true" || t === "run" || t === "open") return "simple"
  return null
}

/** Open trigger-run UI from `?trigger=1` and optional `?pipeline=` / `?pipeline_id=`. Cleans query after handling. */
export function useTriggerRunFromUrl({ enabled = true, onOpen }: Options) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!enabled) return

    const trigger = searchParams.get("trigger")
    const pipeline = (searchParams.get("pipeline") || searchParams.get("pipeline_id") || "").trim()
    const mode = parseTriggerMode(trigger) ?? (pipeline ? "simple" : null)
    if (!mode && !pipeline) return

    onOpen({ pipelineId: pipeline || undefined, mode: mode ?? "simple" })

    const sp = new URLSearchParams(searchParams.toString())
    sp.delete("trigger")
    sp.delete("pipeline")
    sp.delete("pipeline_id")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [enabled, searchParams, pathname, router, onOpen])
}
