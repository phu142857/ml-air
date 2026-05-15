"use client"

import { useEffect, useState } from "react"
import { Settings, Key, Globe, Building2, FolderKanban, Save, Eye, EyeOff, Copy, Check, ExternalLink, Puzzle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  applyRuntimeConfigPatch,
  clearRuntimeConfigOverride,
  getRuntimeConfig,
  readRuntimeConfigOverride,
  writeRuntimeConfigOverride,
} from "@/lib/runtime-config"
import { PluginsSettingsTab } from "@/components/settings/plugins-settings-tab"
import { useAppContext } from "@/lib/app-context"
import { switchScopeContext } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
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
  const [jaegerUrl, setJaegerUrl] = useState("https://jaeger.internal.acme.com")
  const [apiBaseUrl, setApiBaseUrl] = useState("/v1")
  const [scopeSwitching, setScopeSwitching] = useState(false)
  const hasLocalOverride = Boolean(readRuntimeConfigOverride())

  useEffect(() => {
    setDraftToken(token)
  }, [token])

  useEffect(() => {
    const apply = () => {
      const cfg = getRuntimeConfig()
      if (!cfg) return
      const j = String(cfg.jaegerBaseUrl || cfg.observability?.jaeger_ui_url || "").trim()
      const a = String(cfg.apiBaseUrl || cfg.api_base_url || "").trim()
      if (j) setJaegerUrl(j)
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
      await switchScopeContext(token, {
        tenant_id: nextTenant,
        project_id: nextProject,
        expected_mapping_version: mappingVersion,
      })
      await refreshBootstrap({ withSpinner: false })
      toast({ title: "Scope updated", description: `${nextTenant} / ${nextProject}` })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Scope switch failed",
        description: String((e as Error)?.message || e).slice(0, 480),
      })
    } finally {
      setScopeSwitching(false)
    }
  }

  const handleCopy = () => {
    const t = draftToken.trim()
    if (!t) return
    void navigator.clipboard.writeText(t)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const maskedPreview = (t: string) => {
    const s = t.trim()
    if (!s) return "—"
    if (s.length <= 12) return "•".repeat(Math.min(s.length, 8))
    return `${s.slice(0, 6)}…${s.slice(-4)}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-500/20 to-zinc-600/10 border border-zinc-500/20">
            <Settings className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
            <p className="text-xs text-zinc-500">Configure your ML-Air Hub environment</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="runtime" className="flex-1 flex flex-col">
        <div className="border-b border-zinc-800 px-6">
          <TabsList className="bg-transparent h-10 p-0 gap-4">
            <TabsTrigger value="runtime" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-sky-500 rounded-none px-0 pb-3 text-sm">
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Runtime Config
            </TabsTrigger>
            <TabsTrigger value="api" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-sky-500 rounded-none px-0 pb-3 text-sm">
              <Key className="h-3.5 w-3.5 mr-1.5" />
              Session
            </TabsTrigger>
            <TabsTrigger value="scope" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-sky-500 rounded-none px-0 pb-3 text-sm">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Scope Management
            </TabsTrigger>
            <TabsTrigger value="plugins" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-sky-500 rounded-none px-0 pb-3 text-sm">
              <Puzzle className="h-3.5 w-3.5 mr-1.5" />
              Plugins
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <TabsContent value="runtime" className="mt-0 space-y-6">
            <div className="max-w-2xl">
              <div className="rounded-lg border border-zinc-800 p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200 mb-1">Runtime Configuration</h3>
                  <p className="text-xs text-zinc-500">Configure external service URLs and environment settings</p>
                </div>

                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
                  <div className="font-medium text-sky-200">Active API scope</div>
                  <div className="mt-1 font-mono text-zinc-200">
                    {tenantId} <span className="text-zinc-600">/</span> {projectId}
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    mapping v{mappingVersion} · <span className="font-mono">{bootstrapSource}</span>
                    {!isBootstrapped ? " · resolving…" : null}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                    Switch tenant/project from the top bar. Values here reflect the UI session used for API calls.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="jaeger-url" className="text-sm text-zinc-400">Jaeger Base URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="jaeger-url"
                        value={jaegerUrl}
                        onChange={(e) => setJaegerUrl(e.target.value)}
                        placeholder="https://jaeger.example.com"
                        className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 bg-zinc-900 border-zinc-800"
                        onClick={() => {
                          const raw = jaegerUrl.trim().replace(/\/$/, "")
                          if (!raw) {
                            toast({
                              variant: "destructive",
                              title: "Empty URL",
                              description: "Enter a Jaeger UI base URL first."
                            })
                            return
                          }
                          window.open(raw, "_blank", "noopener,noreferrer")
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Test
                      </Button>
                    </div>
                    <p className="text-[10px] text-zinc-600">Used for deep-linking traces from audit events</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api-url" className="text-sm text-zinc-400">API Base URL</Label>
                    <Input
                      id="api-url"
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="/v1"
                      className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                    />
                    <p className="text-[10px] text-zinc-600">Base path for API proxy endpoints</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-800 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-sky-600 hover:bg-sky-500"
                      onClick={() => {
                        const patch = {
                          jaegerBaseUrl: jaegerUrl.trim(),
                          apiBaseUrl: apiBaseUrl.trim(),
                        }
                        writeRuntimeConfigOverride(patch)
                        applyRuntimeConfigPatch(patch)
                        toast({
                          title: "Saved in this browser",
                          description:
                            "Jaeger and API base URLs apply for this session. Deploy config still wins after reset.",
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
                      className="border-zinc-700 bg-zinc-900"
                      disabled={!hasLocalOverride}
                      onClick={() => {
                        clearRuntimeConfigOverride()
                        window.location.reload()
                      }}
                    >
                      Reset to deploy defaults
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    Overrides are stored in <span className="font-mono text-zinc-500">localStorage</span> for operator
                    preview. Production URLs should still come from{" "}
                    <span className="font-mono text-zinc-500">mlair-runtime-config.js</span> or{" "}
                    <span className="font-mono text-zinc-500">GET /v1/runtime-config</span>.
                    {hasLocalOverride ? (
                      <span className="mt-1 block text-amber-500/90">A local override is active.</span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-amber-500/10 text-amber-400">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300">Environment Variable</h4>
                    <p className="text-xs text-zinc-500 mt-1">
                      Configuration is also available via <code className="text-amber-400 bg-zinc-800 px-1 rounded">window.__ML_AIR_RUNTIME_CONFIG__</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="api" className="mt-0 space-y-6">
            <div className="max-w-2xl">
              <div className="rounded-lg border border-zinc-800 p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200 mb-1">Session bearer token</h3>
                  <p className="text-xs text-zinc-500">
                    Token sent as <code className="text-zinc-400">Authorization: Bearer</code> for API requests from
                    this browser. Persisted in <span className="font-mono text-zinc-400">localStorage</span> with
                    tenant/project scope.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="session-token" className="text-sm text-zinc-400">
                    Token value
                  </Label>
                  <Textarea
                    id="session-token"
                    value={draftToken}
                    onChange={(e) => setDraftToken(e.target.value)}
                    spellCheck={false}
                    className="min-h-[88px] resize-y bg-zinc-950 border-zinc-800 font-mono text-xs text-zinc-100"
                    placeholder="Paste bearer token…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-sky-600 hover:bg-sky-500"
                      onClick={() => setToken(draftToken.trim())}
                    >
                      Apply token
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 bg-zinc-900"
                      onClick={() => setDraftToken(token)}
                    >
                      Reset to active
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Key className="h-5 w-5 shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">Preview</span>
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                          {token.trim() ? "active" : "empty"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="truncate text-xs font-mono text-zinc-400">
                          {showApiKey ? draftToken || "—" : maskedPreview(draftToken)}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="shrink-0 text-zinc-500 hover:text-zinc-300"
                          aria-label={showApiKey ? "Hide token" : "Reveal token"}
                        >
                          {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="shrink-0 text-zinc-500 hover:text-zinc-300"
                          aria-label="Copy token"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-600">
                  Token minting and revocation are managed by your identity / API service — this UI only stores the
                  secret locally for development and operator workflows.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scope" className="mt-0 space-y-6">
            <div className="max-w-3xl">
              <div className="rounded-lg border border-zinc-800 p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-200 mb-1">Tenant &amp; project access</h3>
                    <p className="text-xs text-zinc-500">
                      Rows from bootstrap <code className="text-zinc-400">/v1/bootstrap/context</code>. Change the
                      active pair from the top bar scope switcher.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2 border-zinc-700 bg-zinc-900"
                    disabled={!token.trim() || isScopeLoading}
                    onClick={() => void refreshBootstrap()}
                  >
                    {isScopeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh access
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-zinc-500" />
                      <span className="text-sm font-medium text-zinc-300">Active tenant</span>
                    </div>
                    <p className="font-mono text-sm text-zinc-100">{tenantId}</p>
                  </div>
                  <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderKanban className="h-4 w-4 text-zinc-500" />
                      <span className="text-sm font-medium text-zinc-300">Active project</span>
                    </div>
                    <p className="font-mono text-sm text-zinc-100">{projectId}</p>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Accessible scopes</h4>
                  {accessibleScopes.length === 0 ? (
                    <p className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-4 text-sm text-zinc-500">
                      {isBootstrapped
                        ? "No scope rows returned — token may lack cross-project visibility or bootstrap returned an empty list."
                        : "Loading bootstrap context…"}
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-zinc-800">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-800 bg-zinc-900/80">
                          <tr>
                            <th className="px-3 py-2 font-medium text-zinc-400">Tenant</th>
                            <th className="px-3 py-2 font-medium text-zinc-400">Project</th>
                            <th className="px-3 py-2 font-medium text-zinc-400">Role</th>
                            <th className="px-3 py-2 font-medium text-zinc-400"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {accessibleScopes.map((row, idx) => {
                            const active = row.tenant_id === tenantId && row.project_id === projectId
                            return (
                              <tr
                                key={`${row.tenant_id}-${row.project_id}-${row.role}-${idx}`}
                                className={cn(
                                  "border-t border-zinc-800",
                                  !active && !scopeSwitching && "cursor-pointer hover:bg-zinc-900/60",
                                  scopeSwitching && "opacity-60",
                                )}
                                onClick={() => {
                                  if (active || scopeSwitching) return
                                  void switchToScope(row.tenant_id, row.project_id)
                                }}
                              >
                                <td className="px-3 py-2 font-mono text-zinc-200">{row.tenant_id}</td>
                                <td className="px-3 py-2 font-mono text-zinc-300">{row.project_id}</td>
                                <td className="px-3 py-2 text-zinc-400">{row.role || "—"}</td>
                                <td className="px-3 py-2 text-right">
                                  {active ? (
                                    <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400">
                                      active
                                    </Badge>
                                  ) : (
                                    <span className="text-[10px] text-zinc-600">Switch</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-zinc-600">
                  Creating tenants or projects is not available in this UI — use your platform API or provisioning
                  flow.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plugins" className="mt-0 space-y-6">
            <PluginsSettingsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
