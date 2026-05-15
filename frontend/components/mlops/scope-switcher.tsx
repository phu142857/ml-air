"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Building2, FolderKanban, Loader2 } from "lucide-react"
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
import { switchScopeContext } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

export function ScopeSwitcher() {
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
    refreshBootstrap,
    setTenantId,
    setProjectId,
  } = useAppContext()

  const aggregateActive = tenantId === "all" && projectId === "all"

  const tenantIds = useMemo(() => {
    const fromBootstrap = tenantOptions.filter(Boolean)
    if (fromBootstrap.length) return fromBootstrap
    const fromScopes = Array.from(new Set(accessibleScopes.map((s) => s.tenant_id).filter(Boolean)))
    return fromScopes.length ? fromScopes.sort() : [tenantId].filter(Boolean)
  }, [tenantOptions, accessibleScopes, tenantId])

  const projectsForTenant = useMemo(() => {
    if (tenantId === "all") return ["all"]
    const fromScopes = Array.from(
      new Set(accessibleScopes.filter((s) => s.tenant_id === tenantId).map((s) => s.project_id).filter(Boolean))
    )
    const base = fromScopes.length ? fromScopes.sort() : projectOptions.filter(Boolean).length ? projectOptions : [projectId].filter(Boolean)
    if (base.length > 1 && !base.includes("all")) return ["all", ...base]
    return base
  }, [accessibleScopes, tenantId, projectOptions, projectId])

  const busy = isSwitching || isScopeLoading

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
      await switchScopeContext(token, {
        tenant_id: nextTenant,
        project_id: nextProject,
        expected_mapping_version: mappingVersion
      })
      await refreshBootstrap({ withSpinner: false })
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 480)
      toast({
        variant: "destructive",
        title: "Scope switch failed",
        description: msg || "Request rejected or network error."
      })
    } finally {
      setIsSwitching(false)
    }
  }

  const onPickAggregate = () => {
    if (aggregateActive) return
    setTenantId("all")
    setProjectId("all")
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
            className="h-8 max-w-[200px] gap-2 text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" /> : null}
            <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="truncate text-sm font-medium font-mono">{tenantId || "—"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 border-zinc-800 bg-zinc-950">
          <DropdownMenuLabel className="text-xs text-zinc-500">Tenant</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {!isBootstrapped && !tenantIds.length ? (
            <div className="px-2 py-2 text-xs text-zinc-500">Loading scope…</div>
          ) : null}
          {tenantIds.length > 1 ? (
            <DropdownMenuItem
              disabled={busy}
              onClick={onPickAggregate}
              className={aggregateActive ? "bg-zinc-800/60 text-zinc-100" : "text-zinc-300"}
            >
              <Building2 className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs">all (aggregate)</span>
            </DropdownMenuItem>
          ) : null}
          {tenantIds.map((tid) => (
            <DropdownMenuItem
              key={tid}
              disabled={busy}
              onClick={() => onPickTenant(tid)}
              className={tid === tenantId ? "bg-zinc-800/60 text-zinc-100" : "text-zinc-300"}
            >
              <Building2 className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs">{tid}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-zinc-700">/</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!projectsForTenant.length || busy}
            className="h-8 max-w-[220px] gap-2 text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" /> : null}
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="truncate text-sm font-medium font-mono">{projectId || "—"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 border-zinc-800 bg-zinc-950">
          <DropdownMenuLabel className="text-xs text-zinc-500">Project</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {projectsForTenant.map((pid) => (
            <DropdownMenuItem
              key={pid}
              disabled={busy}
              onClick={() => onPickProject(pid)}
              className={pid === projectId ? "bg-zinc-800/60 text-zinc-100" : "text-zinc-300"}
            >
              <FolderKanban className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs">{pid}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
