"use client"

import { useEffect } from "react"

/** Warn on tab close / refresh when form state is dirty. */
export function useUnsavedChangesGuard(dirty: boolean, message = "You have unsaved changes.") {
  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty, message])
}
