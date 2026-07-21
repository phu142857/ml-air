"use client"

import { Suspense } from "react"
import { useTraceFromUrl } from "@/hooks/use-trace-from-url"

type Props = {
  enabled?: boolean
  onOpen: (traceId: string) => void
}

function TraceUrlSyncInner({ enabled, onOpen }: Props) {
  useTraceFromUrl({ enabled, onOpen })
  return null
}

export function TraceUrlSync(props: Props) {
  return (
    <Suspense fallback={null}>
      <TraceUrlSyncInner {...props} />
    </Suspense>
  )
}
