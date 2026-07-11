"use client"

import { useEffect, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

type SuccessFlashProps = {
  active: boolean
  children: ReactNode
  className?: string
}

/** Brief success border/background flash after a completed action. */
export function SuccessFlash({ active, children, className }: SuccessFlashProps) {
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!active) return
    setFlash(true)
    const timer = window.setTimeout(() => setFlash(false), 200)
    return () => window.clearTimeout(timer)
  }, [active])

  return (
    <div className={cn(className, flash && "success-flash")} data-success-flash={flash ? "true" : undefined}>
      {children}
    </div>
  )
}
