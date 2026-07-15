"use client";

import { DetailSection } from "@/components/mlops/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppContext } from "@/lib/app-context";
import {
  L4ErrorState,
  L4LoadingState,
  L4Meta,
  L4SaveBar,
} from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";

export function AdminRuntimeSettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);

  if (query.isLoading) return <L4LoadingState />;
  if (query.isError) return <L4ErrorState error={query.error} />;
  if (!form || !doc) return null;

  const save = () =>
    saveMutation.mutate(partialFromForm(form, ["governance", "features"]));

  return (
    <DetailSection
      title="Runtime settings"
      description="Storage quotas, promotion policy, scheduler limits, and webhook governance (L4)."
      accentBorder="amber"
    >
      <L4Meta doc={doc} />
      <div className="mt-6 space-y-6 text-sm">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Governance</p>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium">Skip approval for promote</p>
            </div>
            <Switch checked={form.skipApproval} onCheckedChange={(v) => setForm({ ...form, skipApproval: v })} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium">Allow skip promotion stages</p>
            </div>
            <Switch checked={form.allowSkipStages} onCheckedChange={(v) => setForm({ ...form, allowSkipStages: v })} />
          </div>
          <div>
            <Label className="text-xs">Promotion stage order (comma-separated)</Label>
            <Input
              value={form.promotionOrder}
              onChange={(e) => setForm({ ...form, promotionOrder: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default tenant quotas</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Max projects</Label>
              <Input value={form.quotaProjects} onChange={(e) => setForm({ ...form, quotaProjects: e.target.value })} className="mt-1 h-8 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Max datasets / project</Label>
              <Input value={form.quotaDatasets} onChange={(e) => setForm({ ...form, quotaDatasets: e.target.value })} className="mt-1 h-8 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Max models / project</Label>
              <Input value={form.quotaModels} onChange={(e) => setForm({ ...form, quotaModels: e.target.value })} className="mt-1 h-8 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Max runs / project</Label>
              <Input value={form.quotaRuns} onChange={(e) => setForm({ ...form, quotaRuns: e.target.value })} className="mt-1 h-8 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Max webhook subs / project</Label>
              <Input value={form.quotaWebhooks} onChange={(e) => setForm({ ...form, quotaWebhooks: e.target.value })} className="mt-1 h-8 font-mono text-xs" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <p className="text-xs font-medium">Enforce tenant quotas</p>
            <Switch
              checked={form.tenantQuotaEnforce}
              onCheckedChange={(v) => setForm({ ...form, tenantQuotaEnforce: v })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhooks</p>
          <div>
            <Label className="text-xs">Platform allowed hosts (comma-separated)</Label>
            <Input
              value={form.platformWebhookHosts}
              onChange={(e) => setForm({ ...form, platformWebhookHosts: e.target.value })}
              placeholder="hooks.internal.example.com"
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>

        <L4SaveBar saving={saveMutation.isPending} onSave={save} />
      </div>
    </DetailSection>
  );
}
