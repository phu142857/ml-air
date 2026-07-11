"use client"

import type { ReactNode } from "react"

type PageTransitionProps = {
  routeKey: string
  children: ReactNode
  className?: string
}

/** Functional route content fade — orients users after navigation. */
export function PageTransition({ routeKey, children, className }: PageTransitionProps) {
  return (
    <div key={routeKey} className={className ?? "page-enter flex min-h-0 flex-1 flex-col overflow-hidden"}>
      {children}
    </div>
  )
}
