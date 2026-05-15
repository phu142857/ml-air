"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { isScopePinned, SCOPE_PIN_HINT } from "@/lib/scope"
import { useAppContext } from "@/lib/app-context"
import { cn } from "@/lib/utils"

type ScopePinnedBannerProps = {
  className?: string
  /** Override default hint text. */
  message?: string
  children?: React.ReactNode
}

export function ScopePinnedBanner({ className, message, children }: ScopePinnedBannerProps) {
  const { tenantId, projectId } = useAppContext()
  if (isScopePinned(tenantId, projectId)) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p>{message ?? SCOPE_PIN_HINT}</p>
        {children}
      </div>
    </div>
  )
}

export function ScopePinnedInline({ message }: { message?: string }) {
  const { tenantId, projectId } = useAppContext()
  if (isScopePinned(tenantId, projectId)) return null
  return (
    <p className="text-sm text-amber-400/90">
      {message ?? SCOPE_PIN_HINT}{" "}
      <Link href="/settings" className="underline hover:text-amber-200">
        Settings → Scope
      </Link>
    </p>
  )
}
