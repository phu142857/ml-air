"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Pin } from "lucide-react"
import { isScopePinned } from "@/lib/scope"
import { SCOPE_PIN_DEFAULT } from "@/lib/scope-messages"
import { useAppContext } from "@/lib/app-context"
import { cn } from "@/lib/utils"

interface ScopePinnedBannerProps {
  message?: string
  variant?: "banner" | "inline"
  className?: string
  children?: ReactNode
}

const tone = cn(
  "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
  "dark:border-[color:var(--status-pending-border)] dark:bg-[color:var(--status-pending-bg)] dark:text-[color:var(--status-pending-fg)]",
)

const iconTone = "text-[color:var(--status-pending-fg)]"

export function ScopePinnedBanner({
  message,
  variant = "banner",
  className,
  children,
}: ScopePinnedBannerProps) {
  const { tenantId, projectId } = useAppContext()
  if (isScopePinned(tenantId, projectId)) return null

  const text = message ?? SCOPE_PIN_DEFAULT

  if (variant === "inline") {
    return (
      <p
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium leading-snug",
          tone,
          className,
        )}
      >
        <Pin className={cn("h-3.5 w-3.5 shrink-0", iconTone)} aria-hidden />
        <span>
          {text}{" "}
          <Link href="/settings" className="underline hover:text-foreground">
            Settings
          </Link>
        </span>
        {children}
      </p>
    )
  }

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 border-b px-6 py-2.5 text-xs font-medium leading-snug",
        tone,
        className,
      )}
    >
      <Pin className={cn("h-3.5 w-3.5 shrink-0", iconTone)} aria-hidden />
      <span className="min-w-0 flex-1">
        {text}{" "}
        <Link href="/settings" className="underline hover:text-foreground">
          Settings
        </Link>
      </span>
      {children}
    </div>
  )
}
