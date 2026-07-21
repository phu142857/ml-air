"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MetadataList,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { L4ErrorState, L4LoadingState } from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminRuntimeSettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    if (form && baseline === null) setBaseline(JSON.stringify(form));
  }, [form, baseline]);

  const dirty = baseline !== null && form ? JSON.stringify(form) !== baseline : false;

  if (query.isLoading) {
    return (
      <SettingsPage>
        <L4LoadingState />
      </SettingsPage>
    );
  }
  if (query.isError) {
    return (
      <SettingsPage error={String((query.error as Error).message)}>
        <L4ErrorState error={query.error} />
      </SettingsPage>
    );
  }
  if (!form || !doc) return null;

  const save = () =>
    saveMutation.mutate(partialFromForm(form, ["governance", "features"]), {
      onSuccess: () => setBaseline(JSON.stringify(form)),
    });

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Runtime"
        description="Storage quotas, promotion policy, scheduler limits, and webhook governance."
      />

      <SettingsSection id="metadata" title="Metadata" description="Last platform settings change.">
        <MetadataList
          items={[
            { label: "Schema version", value: String(doc.schema_version), mono: true },
            { label: "Last updated", value: formatWhen(doc.updated_at) },
            { label: "Updated by", value: doc.updated_by || "—", mono: true },
          ]}
        />
      </SettingsSection>

      <SettingsSection id="governance" title="Governance" description="Promotion and approval behavior.">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Skip approval for promote</p>
              <p className="text-xs text-muted-foreground">Bypass manual approval gates during promotion.</p>
            </div>
            <Switch checked={form.skipApproval} onCheckedChange={(v) => setForm({ ...form, skipApproval: v })} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Allow skip promotion stages</p>
              <p className="text-xs text-muted-foreground">Permit jumping intermediate promotion stages.</p>
            </div>
            <Switch checked={form.allowSkipStages} onCheckedChange={(v) => setForm({ ...form, allowSkipStages: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promotion-order">Promotion stage order</Label>
            <Input
              id="promotion-order"
              value={form.promotionOrder}
              onChange={(e) => setForm({ ...form, promotionOrder: e.target.value })}
              className="h-9 font-mono text-sm"
              placeholder="dev, staging, prod"
            />
            <p className="text-xs text-muted-foreground">Comma-separated stage identifiers.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="quotas" title="Default tenant quotas" description="Resource limits applied to new tenants.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quota-projects">Max projects</Label>
            <Input id="quota-projects" value={form.quotaProjects} onChange={(e) => setForm({ ...form, quotaProjects: e.target.value })} className="h-9 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quota-datasets">Max datasets / project</Label>
            <Input id="quota-datasets" value={form.quotaDatasets} onChange={(e) => setForm({ ...form, quotaDatasets: e.target.value })} className="h-9 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quota-models">Max models / project</Label>
            <Input id="quota-models" value={form.quotaModels} onChange={(e) => setForm({ ...form, quotaModels: e.target.value })} className="h-9 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quota-runs">Max runs / project</Label>
            <Input id="quota-runs" value={form.quotaRuns} onChange={(e) => setForm({ ...form, quotaRuns: e.target.value })} className="h-9 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quota-webhooks">Max webhook subs / project</Label>
            <Input id="quota-webhooks" value={form.quotaWebhooks} onChange={(e) => setForm({ ...form, quotaWebhooks: e.target.value })} className="h-9 font-mono text-sm" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Enforce tenant quotas</p>
            <p className="text-xs text-muted-foreground">Reject operations that exceed configured limits.</p>
          </div>
          <Switch checked={form.tenantQuotaEnforce} onCheckedChange={(v) => setForm({ ...form, tenantQuotaEnforce: v })} />
        </div>
      </SettingsSection>

      <SettingsSection id="webhooks" title="Webhooks" description="Platform-level outbound webhook restrictions.">
        <div className="max-w-lg space-y-1.5">
          <Label htmlFor="webhook-hosts">Platform allowed hosts</Label>
          <Input
            id="webhook-hosts"
            value={form.platformWebhookHosts}
            onChange={(e) => setForm({ ...form, platformWebhookHosts: e.target.value })}
            placeholder="hooks.internal.example.com"
            className="h-9 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Comma-separated host allowlist.</p>
        </div>
        <SettingsFormFooter dirty={dirty} saving={saveMutation.isPending} onSave={save} onCancel={() => baseline && setForm(JSON.parse(baseline))} />
      </SettingsSection>
    </SettingsPage>
  );
}
