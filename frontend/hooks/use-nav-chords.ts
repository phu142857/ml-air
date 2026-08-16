"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { isEditableKeyboardTarget, NAV_CHORD_ROUTES } from "@/lib/keyboard/nav-chords"

const CHORD_TIMEOUT_MS = 1200

export function useNavChords(onShowHelp?: () => void) {
  const router = useRouter()
  const pendingGRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearPending = () => {
      pendingGRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableKeyboardTarget(event.target)) return

      if (event.key === "?" && onShowHelp) {
        event.preventDefault()
        onShowHelp()
        clearPending()
        return
      }

      if (event.key === "g" && !pendingGRef.current) {
        pendingGRef.current = true
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(clearPending, CHORD_TIMEOUT_MS)
        return
      }

      if (!pendingGRef.current) return

      const route = NAV_CHORD_ROUTES[event.key]
      clearPending()
      if (!route) return

      event.preventDefault()
      router.push(route)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      clearPending()
    }
  }, [router, onShowHelp])
}
