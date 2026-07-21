"use client"

import { Suspense } from "react"
import { useTriggerRunFromUrl, type TriggerRunUrlIntent } from "@/hooks/use-trigger-run-from-url"

type Props = {
  enabled?: boolean
  onOpen: (intent: TriggerRunUrlIntent) => void
}

function TriggerRunUrlSyncInner({ enabled, onOpen }: Props) {
  useTriggerRunFromUrl({ enabled, onOpen })
  return null
}

export function TriggerRunUrlSync(props: Props) {
  return (
    <Suspense fallback={null}>
      <TriggerRunUrlSyncInner {...props} />
    </Suspense>
  )
}
