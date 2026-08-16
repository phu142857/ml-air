"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useToast } from "@/hooks/use-toast"
import { useAppContext } from "@/lib/app-context"
import { resolveLineageScopeReset, resolveScopeChangeRedirect } from "@/lib/scope-change-redirect"

/**
 * After the user changes tenant/project scope, leave scoped detail URLs and open
 * the parent list so APIs are not called with the wrong workspace context.
 */
export function useScopeChangeRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { tenantId, projectId, isBootstrapped } = useAppContext()
  const scopeSnapshotRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isBootstrapped) return

    const scopeKey = `${tenantId}:${projectId}`
    if (scopeSnapshotRef.current === null) {
      scopeSnapshotRef.current = scopeKey
      return
    }
    if (scopeSnapshotRef.current === scopeKey) return
    scopeSnapshotRef.current = scopeKey

    const search = searchParams.toString()
    const target =
      resolveScopeChangeRedirect(pathname) ??
      resolveLineageScopeReset(pathname, search ? `?${search}` : "")

    if (!target) return

    router.replace(target.href)
    toast({
      title: "Đã đổi workspace",
      description: `Chuyển về ${target.label} cho scope mới.`,
    })
  }, [tenantId, projectId, pathname, searchParams, isBootstrapped, router, toast])
}
