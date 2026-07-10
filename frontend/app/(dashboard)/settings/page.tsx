"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Settings, Key, Globe, Building2, FolderKanban, Save, Eye, EyeOff, Copy, Check, ExternalLink, Puzzle, Loader2, RefreshCw, Palette, Shield } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { DesignTokensSlide } from "@/components/mlops/design-tokens-slide"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import {
  DetailSection,
  DetailTabList,
  ResourcePageHeader,
  tabPanelScrollClassName,
} from "@/components/mlops/layout"
import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  applyRuntimeConfigPatch,
  clearRuntimeConfigOverride,
  getRuntimeConfig,
  readRuntimeConfigOverride,
  writeRuntimeConfigOverride,
} from "@/lib/runtime-config"
import { PluginsSettingsTab } from "@/components/settings/plugins-settings-tab"
import { useAppContext, type AccessibleScopeRow } from "@/lib/app-context"
import { fetchTenantQuotas, fetchTenantQuotaUsage, upsertTenantQuotas } from "@/lib/api"
import { switchScopeWithRetry } from "@/lib/scope-switch"
import { useToast } from "@/hooks/use-toast"
import { copyWithToast, toastError, toastSuccess } from "@/lib/toast-actions"
import { formatVersionLabel } from "@/lib/version-label"
import { cn } from "@/lib/utils"

const SETTINGS_TABS = ["runtime", "api", "scope", "governance", "plugins", "design-tokens"] as const

function SettingsPageContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const initialTab =
    tabParam && SETTINGS_TABS.includes(tabParam as (typeof SETTINGS_TABS)[number])
      ? tabParam
      : "runtime"
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (tabParam && SETTINGS_TABS.includes(tabParam as (typeof SETTINGS_TABS)[number])) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const { toast } = useToast()
  const {
    tenantId,
    projectId,
    token,
    setToken,
    mappingVersion,
    bootstrapSource,
    isBootstrapped,
    accessibleScopes,
    isScopeLoading,
    refreshBootstrap,
  } = useAppContext()

  const [showApiKey, setShowApiKey] = useState(false)
  const [draftToken, setDraftToken] = useState(token)
  const [copied, setCopied] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState("/v1")
  const [scopeSwitching, setScopeSwitching] = useState(false)
  const hasLocalOverride = Boolean(readRuntimeConfigOverride())
  const queryClient = useQueryClient()
  const [quotaProjects, setQuotaProjects] = useState("200")
  const [quotaDatasets, setQuotaDatasets] = useState("500")
  const [quotaModels, setQuotaModels] = useState("200")
  const [quotaRuns, setQuotaRuns] = useState("50000")
  const [quotaWebhooks, setQuotaWebhooks] = useState("50")
  const [quotaWebhookHosts, setQuotaWebhookHosts] = useState("")
  const [quotaMsg, setQuotaMsg] = useState("")

  const tenantQuotasQuery = useQuery({
    queryKey: ["tenant-quotas", tenantId],
    queryFn: () => fetchTenantQuotas(tenantId, token),
    enabled: Boolean(tenantId && tenantId !== "all" && token.trim()),
  })
  const tenantUsageQuery = useQuery({
    queryKey: ["tenant-quota-usage", tenantId, projectId],
    queryFn: () => fetchTenantQuotaUsage(tenantId, token, projectId !== "all" ? projectId : undefined),
    enabled: Boolean(tenantId && tenantId !== "all" && token.trim()),
  })

  useEffect(() => {
    const q = tenantQuotasQuery.data
    if (!q) return
    setQuotaProjects(String(q.max_projects ?? ""))
    setQuotaDatasets(String(q.max_datasets_per_project ?? ""))
    setQuotaModels(String(q.max_models_per_project ?? ""))
    setQuotaRuns(String(q.max_runs_per_project ?? ""))
    setQuotaWebhooks(String(q.max_webhook_subscriptions_per_project ?? ""))
    setQuotaWebhookHosts((q.webhook_allowed_hosts || []).join(", "))
  }, [tenantQuotasQuery.data])

  const quotaSaveMutation = useMutation({
    mutationFn: () =>
      upsertTenantQuotas(tenantId, token, {
        max_projects: Number.parseInt(quotaProjects, 10) || null,
        max_datasets_per_project: Number.parseInt(quotaDatasets, 10) || null,
        max_models_per_project: Number.parseInt(quotaModels, 10) || null,
        max_runs_per_project: Number.parseInt(quotaRuns, 10) || null,
        max_webhook_subscriptions_per_project: Number.parseInt(quotaWebhooks, 10) || null,
        webhook_allowed_hosts: quotaWebhookHosts.trim()
          ? quotaWebhookHosts.split(",").map((h) => h.trim()).filter(Boolean)
          : null,
      }),
    onSuccess: async () => {
      setQuotaMsg("")
      toastSuccess("Quotas saved")
      await queryClient.invalidateQueries({ queryKey: ["tenant-quotas", tenantId] })
      await queryClient.invalidateQueries({ queryKey: ["tenant-quota-usage", tenantId] })
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message || e)
      setQuotaMsg(msg)
      toastError("Save failed", msg)
    },
  })

  useEffect(() => {
    setDraftToken(token)
  }, [token])

  useEffect(() => {
    const apply = () => {
      const cfg = getRuntimeConfig()
      if (!cfg) return
      const a = String(cfg.apiBaseUrl || cfg.api_base_url || "").trim()
      if (a) setApiBaseUrl(a)
    }
    apply()
    window.addEventListener("mlair-runtime-config-updated", apply)
    return () => window.removeEventListener("mlair-runtime-config-updated", apply)
  }, [])

  const switchToScope = async (nextTenant: string, nextProject: string) => {
    if (nextTenant === tenantId && nextProject === projectId) return
    if (!token.trim()) {
      toast({
        variant: "destructive",
        title: "No bearer token",
        description: "Apply a session token before switching scope.",
      })
      return
    }
    setScopeSwitching(true)
    try {
      await switchScopeWithRetry(
        { token, tenant_id: nextTenant, project_id: nextProject, expected_mapping_version: mappingVersion },
        { refreshBootstrap, getMappingVersion: () => mappingVersion },
      )
      toast({ title: "Scope updated", description: `${nextTenant} / ${nextProject}` })
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 480)
      toast({
        variant: "destructive",
        title: "Scope switch failed",
        description: msg.includes("mapping_version_stale")
          ? "Workspace mapping changed. Refresh the page or try again."
          : msg,
      })
    } finally {
      setScopeSwitching(false)
    }
  }

  const handleCopy = () => {
    const t = draftToken.trim()
    if (!t) return
    void copyWithToast(t, {
      successTitle: "Token copied",
      successDescription: "Paste into Authorization headers or CLI tools.",
    }).then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    })
  }

  const scopeTableColumns: DataTableColumn<AccessibleScopeRow>[] = useMemo(
    () => [
      {
        id: "tenant",
        header: "Tenant",
        cell: (r) => <span className="font-mono text-foreground">{r.tenant_id}</span>,
      },
      {
        id: "project",
        header: "Project",
        cell: (r) => <span className="font-mono text-foreground/90">{r.project_id}</span>,
      },
      {
        id: "role",
        header: "Role",
        cell: (r) => <span className="text-muted-foreground">{r.role || "—"}</span>,
      },
      {
        id: "state",
        header: "",
        className: "w-[88px]",
        cell: (row) => {
          const active = row.tenant_id === tenantId && row.project_id === projectId
          return active ? (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              active
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground/80">Switch</span>
          )
        },
      },
    ],
    [tenantId, projectId],
  )

  const maskedPreview = (t: string) => {
    const s = t.trim()
    if (!s) return "—"
    if (s.length <= 12) return "•".repeat(Math.min(s.length, 8))
    return `${s.slice(0, 6)}…${s.slice(-4)}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Settings}
        accent="zinc"
        title="Settings"
        subtitle="Configure your ML-Air Hub environment"
      />

      {/* Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <DetailTabList
          accent="sky"
          tabs={[
            { id: "runtime", label: "Runtime Config", icon: <Globe className="h-3.5 w-3.5" /> },
            { id: "api", label: "Session", icon: <Key className="h-3.5 w-3.5" /> },
            { id: "scope", label: "Scope Management", icon: <Building2 className="h-3.5 w-3.5" /> },
            { id: "governance", label: "Governance", icon: <Shield className="h-3.5 w-3.5" /> },
            { id: "plugins", label: "Plugins", icon: <Puzzle className="h-3.5 w-3.5" /> },
            { id: "design-tokens", label: "Design Tokens", icon: <Palette className="h-3.5 w-3.5" /> },
          ]}
        />

          <TabsContent value="runtime" className={tabPanelScrollClassName("space-y-6")}>
            <div className="max-w-2xl space-y-6">
              <DetailSection
                title="Runtime configuration"
                description="Configure external service URLs and environment settings."
                accentBorder="sky"
              >
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                  <div className="font-medium text-primary">Active API scope</div>
                  <div className="mt-1 font-mono text-foreground">
                    {tenantId} <span className="text-muted-foreground/80">/</span> {projectId}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    mapping {formatVersionLabel(mappingVersion)} · <span className="font-mono">{bootstrapSource}</span>
                    {!isBootstrapped ? " · resolving…" : null}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/80">
                    Scope matches the header selector for API calls.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-url" className="text-sm text-muted-foreground">
                      API Base URL
                    </Label>
                    <Input
                      id="api-url"
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="/v1"
                      className="bg-card border-border font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground/80">Base path for API proxy endpoints</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-primary hover:bg-primary/90"
                      onClick={() => {
                        const patch = {
                          apiBaseUrl: apiBaseUrl.trim(),
                        }
                        writeRuntimeConfigOverride(patch)
                        applyRuntimeConfigPatch(patch)
                        toast({
                          title: "Saved in this browser",
                          description:
                            "API base URL applies for this session. Deploy config still wins after reset.",
                        })
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save locally
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-border bg-card"
                      disabled={!hasLocalOverride}
                      onClick={() => {
                        clearRuntimeConfigOverride()
                        window.location.reload()
                      }}
                    >
                      Reset to deploy defaults
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80">
                    Overrides are stored in <span className="font-mono text-muted-foreground">localStorage</span> for operator
                    preview. Production URLs should still come from{" "}
                    <span className="font-mono text-muted-foreground">mlair-runtime-config.js</span> or{" "}
                    <span className="font-mono text-muted-foreground">GET /v1/runtime-config</span>.
                    {hasLocalOverride ? (
                      <span className="mt-1 block text-[color:var(--status-pending-fg)]/90">A local override is active.</span>
                    ) : null}
                  </p>
                </div>
              </DetailSection>

              <DetailSection
                title="Environment variable"
                description="Configuration is also exposed as window.__ML_AIR_RUNTIME_CONFIG__."
                accentBorder="none"
                bodyClassName="pt-4"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-[color:var(--status-pending-bg)] p-2 text-[color:var(--status-pending-fg)]">
                    <Globe className="h-4 w-4" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    See <code className="rounded bg-muted px-1 text-[color:var(--status-pending-fg)]">window.__ML_AIR_RUNTIME_CONFIG__</code> in the
                    browser console for the merged runtime object.
                  </p>
                </div>
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value="api" className={tabPanelScrollClassName("space-y-6")}>
            <div className="max-w-2xl">
              <DetailSection
                title="Session bearer token"
                description="Token sent as Authorization: Bearer for API requests. Stored in localStorage with tenant/project scope."
                accentBorder="violet"
              >
                <div className="space-y-2">
                  <Label htmlFor="session-token" className="text-sm text-muted-foreground">
                    Token value
                  </Label>
                  <Textarea
                    id="session-token"
                    value={draftToken}
                    onChange={(e) => setDraftToken(e.target.value)}
                    spellCheck={false}
                    className="min-h-[88px] resize-y border-border bg-muted/30 font-mono text-xs text-foreground"
                    placeholder="Paste bearer token…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-primary hover:bg-primary/90"
                      onClick={() => setToken(draftToken.trim())}
                    >
                      Apply token
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border bg-card"
                      onClick={() => setDraftToken(token)}
                    >
                      Reset to active
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 panel-surface p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Key className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Preview</span>
                        <Badge variant="outline" className="border-[color:var(--status-success-border)] text-[10px] text-[color:var(--status-success-fg)]">
                          {token.trim() ? "active" : "empty"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="truncate font-mono text-xs text-muted-foreground">
                          {showApiKey ? draftToken || "—" : maskedPreview(draftToken)}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="shrink-0 text-muted-foreground hover:text-foreground/90"
                          aria-label={showApiKey ? "Hide token" : "Reveal token"}
                        >
                          {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="shrink-0 text-muted-foreground hover:text-foreground/90"
                          aria-label="Copy token"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--status-success-fg)]" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground/80">
                  Token minting and revocation are managed by your identity / API service — this UI only stores the secret
                  locally for development and operator workflows.
                </p>
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value="scope" className={tabPanelScrollClassName("space-y-6")}>
            <div className="max-w-3xl">
              <DetailSection
                title="Tenant & project access"
                description="Rows from bootstrap /v1/bootstrap/context. Change the active pair from the top bar scope switcher."
                accentBorder="amber"
                headerActions={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2 border-border bg-card"
                    disabled={!token.trim() || isScopeLoading}
                    onClick={async () => {
                      try {
                        await refreshBootstrap()
                        toastSuccess("Access list refreshed")
                      } catch (e) {
                        toastError("Refresh failed", String((e as Error)?.message || e))
                      }
                    }}
                  >
                    {isScopeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh access
                  </Button>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="panel-surface p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground/90">Active tenant</span>
                    </div>
                    <p className="font-mono text-sm text-foreground">{tenantId}</p>
                  </div>
                  <div className="panel-surface p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground/90">Active project</span>
                    </div>
                    <p className="font-mono text-sm text-foreground">{projectId}</p>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Accessible scopes
                  </h4>
                  {accessibleScopes.length === 0 ? (
                    <p className="inset-surface px-3 py-4 text-sm text-muted-foreground">
                      {isBootstrapped
                        ? "No scope rows returned — token may lack cross-project visibility or bootstrap returned an empty list."
                        : "Loading bootstrap context…"}
                    </p>
                  ) : (
                    <MlopsDataTable
                      columns={scopeTableColumns}
                      data={accessibleScopes}
                      keyExtractor={(row) => `${row.tenant_id}-${row.project_id}-${row.role}`}
                      onRowClick={(row) => {
                        if (row.tenant_id === tenantId && row.project_id === projectId) return
                        if (scopeSwitching) return
                        void switchToScope(row.tenant_id, row.project_id)
                      }}
                      rowClassName={(row) =>
                        cn(
                          row.tenant_id === tenantId && row.project_id === projectId && "bg-primary/5",
                          !scopeSwitching &&
                            !(row.tenant_id === tenantId && row.project_id === projectId) &&
                            "cursor-pointer",
                          scopeSwitching && "pointer-events-none opacity-60",
                        )
                      }
                      emptyMessage="No scopes."
                    />
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground/80">
                  Creating tenants or projects is not available in this UI — use your platform API or provisioning flow.
                </p>
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value="governance" className={tabPanelScrollClassName("space-y-6")}>
            <div className="max-w-2xl">
              <DetailSection
                title="Tenant quotas"
                description="Capacity limits per tenant and project. Enforcement requires ML_AIR_TENANT_QUOTA_ENFORCE=1 on the API."
                accentBorder="amber"
              >
                {tenantId === "all" ? (
                  <p className="text-sm text-muted-foreground">
                    Pin a single tenant in the header to edit quotas for that tenant.
                  </p>
                ) : (
                  <div className="space-y-4 text-sm">
                    {tenantUsageQuery.data ? (
                      <div className="inset-surface px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        <div>
                          projects {tenantUsageQuery.data.usage.projects ?? "—"} / {tenantUsageQuery.data.limits.max_projects ?? "∞"}
                        </div>
                        {tenantUsageQuery.data.usage.project_id ? (
                          <>
                            <div>
                              datasets {tenantUsageQuery.data.usage.datasets ?? "—"} /{" "}
                              {tenantUsageQuery.data.limits.max_datasets_per_project ?? "∞"}
                            </div>
                            <div>
                              models {tenantUsageQuery.data.usage.models ?? "—"} /{" "}
                              {tenantUsageQuery.data.limits.max_models_per_project ?? "∞"}
                            </div>
                            <div>
                              runs {tenantUsageQuery.data.usage.runs ?? "—"} /{" "}
                              {tenantUsageQuery.data.limits.max_runs_per_project ?? "∞"}
                            </div>
                            <div>
                              webhooks {tenantUsageQuery.data.usage.webhook_subscriptions ?? "—"} /{" "}
                              {tenantUsageQuery.data.limits.max_webhook_subscriptions_per_project ?? "∞"}
                            </div>
                          </>
                        ) : null}
                        <p className="mt-1 text-[10px]">
                          enforcement: {tenantUsageQuery.data.enforcement_enabled ? "on" : "off"}
                        </p>
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Max projects</Label>
                        <Input value={quotaProjects} onChange={(e) => setQuotaProjects(e.target.value)} className="mt-1 h-8 font-mono text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Max datasets / project</Label>
                        <Input value={quotaDatasets} onChange={(e) => setQuotaDatasets(e.target.value)} className="mt-1 h-8 font-mono text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Max models / project</Label>
                        <Input value={quotaModels} onChange={(e) => setQuotaModels(e.target.value)} className="mt-1 h-8 font-mono text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Max runs / project</Label>
                        <Input value={quotaRuns} onChange={(e) => setQuotaRuns(e.target.value)} className="mt-1 h-8 font-mono text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Max webhook subs / project</Label>
                        <Input value={quotaWebhooks} onChange={(e) => setQuotaWebhooks(e.target.value)} className="mt-1 h-8 font-mono text-xs" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Webhook hosts (tenant subset, comma-separated)</Label>
                      <Input
                        value={quotaWebhookHosts}
                        onChange={(e) => setQuotaWebhookHosts(e.target.value)}
                        placeholder="hooks.internal.example.com"
                        className="mt-1 h-8 font-mono text-xs"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Must also appear in global ML_AIR_WEBHOOK_ALLOWED_HOSTS. Leave empty to use global list only.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={quotaSaveMutation.isPending || tenantQuotasQuery.isLoading}
                      onClick={() => quotaSaveMutation.mutate()}
                    >
                      Save tenant quotas
                    </Button>
                    {quotaMsg ? <p className="text-xs text-muted-foreground">{quotaMsg}</p> : null}
                  </div>
                )}
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value="plugins" className={tabPanelScrollClassName("space-y-6")}>
            <PluginsSettingsTab />
          </TabsContent>

          <TabsContent value="design-tokens" className={tabPanelScrollClassName()}>
            <DetailSection
              title="Design tokens"
              description="Semantic palette and radii used across the Hub."
              accentBorder="violet"
              bodyClassName="space-y-4"
            >
              <DesignTokensSlide />
            </DetailSection>
          </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="scroll-region p-6">
            <ListTableSkeleton rows={8} />
          </div>
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  )
}
