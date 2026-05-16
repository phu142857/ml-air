"use client"

import { useEffect, useState } from "react"

/** Brief loading state when switching detail tabs (mock fetch UX). */
export function useTabLoading(activeTab: string, delayMs = 320) {
  const [isTabLoading, setIsTabLoading] = useState(false)

  useEffect(() => {
    setIsTabLoading(true)
    const t = window.setTimeout(() => setIsTabLoading(false), delayMs)
    return () => window.clearTimeout(t)
  }, [activeTab, delayMs])

  return isTabLoading
}
