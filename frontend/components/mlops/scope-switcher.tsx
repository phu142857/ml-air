"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Building2, FolderKanban, Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAppContext } from "@/lib/app-context"
import { switchScopeWithRetry } from "@/lib/scope-switch"
import { useToast } from "@/hooks/use-toast"

export function ScopeSwitcher() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSwitching, setIsSwitching] = useState(false)
  const {
    tenantId,
    projectId,
    accessibleScopes,
    tenantOptions,
    projectOptions,
    token,
    mappingVersion,
    isScopeLoading,
    isBootstrapped,
    isGlobalAdmin,
    refreshBootstrap,
    setTenantId,
    setProjectId,
  } = useAppContext()

  const aggregateActive = tenantId === "all" && projectId === "all"

  const scopedPairs = useMemo(
    () =>
      accessibleScopes
        .map((s) => ({ tenant_id: s.tenant_id, project_id: s.project_id }))
        .filter((s) => s.tenant_id && s.project_id && s.tenant_id !== "*" && s.project_id !== "*"),
    [accessibleScopes],
  )

  const distinctTenants = useMemo(
    () => Array.from(new Set(scopedPairs.map((s) => s.tenant_id))).sort(),
    [scopedPairs],
  )

  const canAggregate =
    isGlobalAdmin || distinctTenants.length > 1 || scopedPairs.length > 1

  const tenantIds = useMemo(() => {
    if (distinctTenants.length) return distinctTenants
    const fromBootstrap = tenantOptions.filter((t) => t && t !== "all")
    if (fromBootstrap.length) return fromBootstrap
    return [tenantId].filter(Boolean)
  }, [distinctTenants, tenantOptions, tenantId])

  const projectsForTenant = useMemo(() => {
    if (tenantId === "all") return canAggregate ? ["all"] : []
    const fromScopes = Array.from(
      new Set(accessibleScopes.filter((s) => s.tenant_id === tenantId).map((s) => s.project_id).filter(Boolean))
    ).filter((p) => p !== "*")
    const base = fromScopes.length ? fromScopes.sort() : projectOptions.filter(Boolean).length ? projectOptions : [projectId].filter(Boolean)
    if (canAggregate && base.length > 1 && !base.includes("all")) return ["all", ...base]
    return base
  }, [accessibleScopes, tenantId, projectOptions, projectId, canAggregate])

  const busy = isSwitching || isScopeLoading

  const goToDashboard = () => {
    router.replace("/dashboard")
  }

  const applyScopeChange = async (nextTenant: string, nextProject: string) => {
    if (!token.trim()) {
      toast({
        title: "No bearer token",
        description: "Open Settings → Session and apply a token before switching scope.",
        variant: "destructive"
      })
      return
    }
    setIsSwitching(true)
    try {
      await switchScopeWithRetry(
        { token, tenant_id: nextTenant, project_id: nextProject, expected_mapping_version: mappingVersion },
        { refreshBootstrap, getMappingVersion: () => mappingVersion },
      )
      goToDashboard()
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 480)
      toast({
        variant: "destructive",
        title: "Scope switch failed",
        description: msg.includes("mapping_version_stale")
          ? "Workspace mapping changed. Refresh the page or try again."
          : msg || "Request rejected or network error.",
      })
    } finally {
      setIsSwitching(false)
    }
  }

  const onPickAggregate = () => {
    if (!canAggregate || aggregateActive) return
    setTenantId("all")
    setProjectId("all")
    goToDashboard()
    toast({
      title: "Aggregate scope",
      description: "Lists fan out across tenants/projects. Pin a scope for triggers, search, and exports.",
    })
  }

  const onPickTenant = (tid: string) => {
    if (tid === tenantId) return
    if (tid === "all") {
      onPickAggregate()
      return
    }
    const scoped = Array.from(
      new Set(accessibleScopes.filter((s) => s.tenant_id === tid).map((s) => s.project_id).filter(Boolean))
    ).sort()
    const keep = scoped.includes(projectId) && projectId !== "all"
    const next = keep ? projectId : scoped[0] || "default_project"
    void applyScopeChange(tid, next)
  }

  const onPickProject = (pid: string) => {
    if (pid === projectId) return
    if (pid === "all") {
      if (tenantId === "all") {
        onPickAggregate()
        return
      }
      setProjectId("all")
      goToDashboard()
      toast({
        title: "All projects in tenant",
        description: `Aggregating projects under ${tenantId}.`,
      })
      return
    }
    if (tenantId === "all") {
      toast({
        variant: "destructive",
        title: "Pick a tenant first",
        description: "Choose a tenant before selecting a specific project.",
      })
      return
    }
    void applyScopeChange(tenantId, pid)
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!tenantIds.length || busy}
            className="h-8 max-w-[200px] gap-2 rounded-md text-foreground/90 transition-default hover:bg-muted/80 hover:text-foreground"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium font-mono">{tenantId || "—"}</span>
            {aggregateActive ? (
              <Globe className="h-3 w-3 shrink-0 text-[color:var(--status-pending-fg)]" aria-hidden />
            ) : null}
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 rounded-md border-border/60 bg-card">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Tenant</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-muted" />
          {!isBootstrapped && !tenantIds.length ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Loading scope…</div>
          ) : null}
          {canAggregate && tenantIds.length > 1 ? (
            <DropdownMenuItem
              disabled={busy}
              onClick={onPickAggregate}
              className={aggregateActive ? "bg-muted/80 text-foreground" : "text-foreground/90"}
            >
              <Globe className="mr-2 h-3.5 w-3.5 shrink-0 text-[color:var(--status-pending-fg)]" />
              <span className="font-mono text-xs">all (aggregate)</span>
            </DropdownMenuItem>
          ) : null}
          {tenantIds.map((tid) => (
            <DropdownMenuItem
              key={tid}
              disabled={busy}
              onClick={() => onPickTenant(tid)}
              className={tid === tenantId ? "bg-muted/80 text-foreground" : "text-foreground/90"}
            >
              <Building2 className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs">{tid}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-muted-foreground" aria-hidden>
        /
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!projectsForTenant.length || busy}
            className="h-8 max-w-[220px] gap-2 rounded-md text-foreground/90 transition-default hover:bg-muted/80 hover:text-foreground"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium font-mono">{projectId || "—"}</span>
            {tenantId !== "all" && projectId === "all" ? (
              <Globe className="h-3 w-3 shrink-0 text-[color:var(--status-pending-fg)]" aria-hidden />
            ) : null}
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 rounded-md border-border/60 bg-card">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Project</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-muted" />
          {projectsForTenant.map((pid) => (
            <DropdownMenuItem
              key={pid}
              disabled={busy}
              onClick={() => onPickProject(pid)}
              className={pid === projectId ? "bg-muted/80 text-foreground" : "text-foreground/90"}
            >
              {pid === "all" ? (
                <Globe className="mr-2 h-3.5 w-3.5 shrink-0 text-[color:var(--status-pending-fg)]" />
              ) : (
                <FolderKanban className="mr-2 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="font-mono text-xs">{pid}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
