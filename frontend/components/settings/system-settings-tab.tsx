"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Server } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchSystemSettings,
  HUB_ROUTES,
  patchSystemSettings,
  type L4Settings,
} from "@/lib/system-settings-api";
import { toastError, toastSuccess } from "@/lib/toast-actions";

type SystemSettingsTabProps = {
  token: string;
};

function parseIntOr(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function hostsToString(hosts: string[] | undefined): string {
  return (hosts || []).join(", ");
}

function hostsFromString(raw: string): string[] {
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function SystemSettingsTab({ token }: SystemSettingsTabProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => fetchSystemSettings(token),
    enabled: Boolean(token.trim()),
  });

  const [hubRoute, setHubRoute] = useState<string>("datasets");
  const [lockoutThreshold, setLockoutThreshold] = useState("5");
  const [lockoutMinutes, setLockoutMinutes] = useState("15");
  const [skipApproval, setSkipApproval] = useState(true);
  const [allowSkipStages, setAllowSkipStages] = useState(true);
  const [tenantQuotaEnforce, setTenantQuotaEnforce] = useState(true);
  const [promotionOrder, setPromotionOrder] = useState("staging,production");
  const [quotaProjects, setQuotaProjects] = useState("200");
  const [quotaDatasets, setQuotaDatasets] = useState("500");
  const [quotaModels, setQuotaModels] = useState("200");
  const [quotaRuns, setQuotaRuns] = useState("50000");
  const [quotaWebhooks, setQuotaWebhooks] = useState("50");
  const [platformWebhookHosts, setPlatformWebhookHosts] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    const s = query.data?.settings;
    if (!s) return;
    setHubRoute(s.hub?.default_route || "datasets");
    setLockoutThreshold(String(s.identity?.lockout_threshold ?? 5));
    setLockoutMinutes(String(s.identity?.lockout_minutes ?? 15));
    setSkipApproval(Boolean(s.governance?.skip_approval_for_promote ?? true));
    setAllowSkipStages(Boolean(s.governance?.promotion_allow_skip_stages ?? true));
    setTenantQuotaEnforce(Boolean(s.features?.tenant_quota_enforce ?? true));
    setPromotionOrder((s.governance?.promotion_stage_order || ["staging", "production"]).join(","));
    const q = s.governance?.quota_defaults;
    setQuotaProjects(String(q?.max_projects ?? 200));
    setQuotaDatasets(String(q?.max_datasets_per_project ?? 500));
    setQuotaModels(String(q?.max_models_per_project ?? 200));
    setQuotaRuns(String(q?.max_runs_per_project ?? 50000));
    setQuotaWebhooks(String(q?.max_webhook_subscriptions_per_project ?? 50));
    setPlatformWebhookHosts(hostsToString(s.governance?.webhook_allowed_hosts));
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const partial: Partial<L4Settings> = {
        hub: { default_route: hubRoute },
        identity: {
          lockout_threshold: parseIntOr(lockoutThreshold, 5),
          lockout_minutes: parseIntOr(lockoutMinutes, 15),
        },
        governance: {
          skip_approval_for_promote: skipApproval,
          promotion_allow_skip_stages: allowSkipStages,
          promotion_stage_order: promotionOrder
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
          quota_defaults: {
            max_projects: parseIntOr(quotaProjects, 200),
            max_datasets_per_project: parseIntOr(quotaDatasets, 500),
            max_models_per_project: parseIntOr(quotaModels, 200),
            max_runs_per_project: parseIntOr(quotaRuns, 50000),
            max_webhook_subscriptions_per_project: parseIntOr(quotaWebhooks, 50),
          },
          webhook_allowed_hosts: hostsFromString(platformWebhookHosts),
        },
        features: {
          tenant_quota_enforce: tenantQuotaEnforce,
        },
      };
      return patchSystemSettings(token, partial as Record<string, unknown>);
    },
    onSuccess: async () => {
      setSaveMsg("");
      toastSuccess("Platform settings saved");
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message || e);
      setSaveMsg(msg);
      toastError("Save failed", msg);
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading platform settings…
      </div>
    );
  }

  if (query.isError) {
    return (
      <DetailSection
        title="System settings"
        description="L4 platform policy from the database (global admin)."
        accentBorder="amber"
      >
        <p className="text-sm text-destructive">{String((query.error as Error)?.message || query.error)}</p>
      </DetailSection>
    );
  }

  const doc = query.data;
  if (!doc) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <DetailSection
        title="System settings (L4)"
        description="Platform policy stored in the database. Changes apply on the next API request — no restart."
        accentBorder="amber"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          <span>
            schema v{doc.schema_version}
            {doc.updated_at ? ` · updated ${doc.updated_at}` : ""}
            {doc.updated_by ? ` · by ${doc.updated_by}` : ""}
          </span>
        </div>

        <div className="mt-6 space-y-6 text-sm">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hub</p>
            <div>
              <Label className="text-xs">Default route</Label>
              <Select value={hubRoute} onValueChange={setHubRoute}>
                <SelectTrigger className="mt-1 h-8 w-full max-w-xs text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUB_ROUTES.map((route) => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identity</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Lockout threshold (failed logins)</Label>
                <Input
                  value={lockoutThreshold}
                  onChange={(e) => setLockoutThreshold(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Lockout duration (minutes)</Label>
                <Input
                  value={lockoutMinutes}
                  onChange={(e) => setLockoutMinutes(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Governance</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-xs font-medium">Skip approval for promote</p>
                  <p className="text-[10px] text-muted-foreground">When off, production promote requires approval.</p>
                </div>
                <Switch checked={skipApproval} onCheckedChange={setSkipApproval} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-xs font-medium">Allow skip promotion stages</p>
                  <p className="text-[10px] text-muted-foreground">Permit non-sequential stage jumps.</p>
                </div>
                <Switch checked={allowSkipStages} onCheckedChange={setAllowSkipStages} />
              </div>
              <div>
                <Label className="text-xs">Promotion stage order (comma-separated)</Label>
                <Input
                  value={promotionOrder}
                  onChange={(e) => setPromotionOrder(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default tenant quotas</p>
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
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-xs font-medium">Enforce tenant quotas</p>
                <p className="text-[10px] text-muted-foreground">Return 429 when tenants exceed limits.</p>
              </div>
              <Switch checked={tenantQuotaEnforce} onCheckedChange={setTenantQuotaEnforce} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhooks</p>
            <div>
              <Label className="text-xs">Platform allowed hosts (comma-separated)</Label>
              <Input
                value={platformWebhookHosts}
                onChange={(e) => setPlatformWebhookHosts(e.target.value)}
                placeholder="hooks.internal.example.com, localhost"
                className="mt-1 h-8 font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Required before tenants can register webhook subscriptions. Tenant lists may further restrict hosts (L5).
              </p>
            </div>
          </div>

          <Button type="button" size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving…" : "Save platform settings"}
          </Button>
          {saveMsg ? <p className="text-xs text-destructive">{saveMsg}</p> : null}
        </div>
      </DetailSection>

      <DetailSection
        title="Raw document"
        description="Full L4 JSON after last fetch (read-only)."
        accentBorder="amber"
      >
        <pre className="max-h-[min(40vh,360px)] overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(doc.settings, null, 2)}
        </pre>
      </DetailSection>
    </div>
  );
}
