"use client";

import { useEffect, useState } from "react";
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
    saveMutation.mutate(partialFromForm(form, ["governance", "features", "runtime"]), {
      onSuccess: () => setBaseline(JSON.stringify(form)),
    });

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Runtime"
      />

      <SettingsSection id="metadata" title="Metadata" description="Last published system settings document.">
        <MetadataList
          items={[
            { label: "Schema version", value: String(doc.schema_version), mono: true },
            { label: "Last updated", value: formatWhen(doc.updated_at) },
            { label: "Updated by", value: doc.updated_by || "—", mono: true },
          ]}
        />
      </SettingsSection>

      <SettingsSection id="execution" title="Task execution">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Execution mode</Label>
            <Select
              value={form.taskExecutionMode}
              onValueChange={(v) =>
                setForm({ ...form, taskExecutionMode: v === "internal" ? "internal" : "external" })
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="external">external (worker lease)</SelectItem>
                <SelectItem value="internal">internal (built-in executor)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lease-seconds">Task lease seconds</Label>
            <Input
              id="lease-seconds"
              value={form.taskLeaseSeconds}
              onChange={(e) => setForm({ ...form, taskLeaseSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reap-seconds">Lease reap interval seconds</Label>
            <Input
              id="reap-seconds"
              value={form.leaseReapIntervalSeconds}
              onChange={(e) => setForm({ ...form, leaseReapIntervalSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Log level</Label>
            <Select value={form.logLevel} onValueChange={(v) => setForm({ ...form, logLevel: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dataset-root">Dataset artifact root</Label>
            <Input
              id="dataset-root"
              value={form.datasetArtifactRoot}
              onChange={(e) => setForm({ ...form, datasetArtifactRoot: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="model-root">Model artifact root</Label>
            <Input
              id="model-root"
              value={form.modelArtifactRoot}
              onChange={(e) => setForm({ ...form, modelArtifactRoot: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sample-interval">Resource sample interval</Label>
            <Input
              id="sample-interval"
              value={form.resourceSampleInterval}
              onChange={(e) => setForm({ ...form, resourceSampleInterval: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flush-interval">Resource flush interval</Label>
            <Input
              id="flush-interval"
              value={form.resourceFlushInterval}
              onChange={(e) => setForm({ ...form, resourceFlushInterval: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3 sm:col-span-2">
            <p className="text-sm font-medium">Replay require artifact evidence</p>
            <Switch
              checked={form.replayRequireArtifactEvidence}
              onCheckedChange={(v) => setForm({ ...form, replayRequireArtifactEvidence: v })}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="governance" title="Governance">
        <div className="space-y-3">
          {(
            [
              ["skipApproval", "Skip approval for promote"],
              ["allowSkipStages", "Allow skip promotion stages"],
              ["rollbackEnabled", "Rollback enabled"],
              ["rollbackRequiresApproval", "Rollback requires approval"],
              ["replayRequireChecksum", "Replay require checksum"],
              ["replayRequireSignedManifest", "Replay require signed manifest"],
            ] as const
          ).map(([field, label]) => (
            <div
              key={field}
              className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3"
            >
              <p className="text-sm font-medium">{label}</p>
              <Switch
                checked={Boolean(form[field])}
                onCheckedChange={(v) => setForm({ ...form, [field]: v })}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="promotion-order">Promotion stage order</Label>
            <Input
              id="promotion-order"
              value={form.promotionOrder}
              onChange={(e) => setForm({ ...form, promotionOrder: e.target.value })}
              className="h-9 font-mono text-sm"
              placeholder="staging, production"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="approval-stages">Approval-required stages</Label>
            <Input
              id="approval-stages"
              value={form.promotionApprovalStages}
              onChange={(e) => setForm({ ...form, promotionApprovalStages: e.target.value })}
              className="h-9 font-mono text-sm"
              placeholder="production"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="quotas" title="Default tenant quotas">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["quotaProjects", "Max projects"],
              ["quotaDatasets", "Max datasets / project"],
              ["quotaModels", "Max models / project"],
              ["quotaRuns", "Max runs / project"],
              ["quotaWebhooks", "Max webhook subs / project"],
              ["quotaParallelTasks", "Max parallel tasks"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={field}>{label}</Label>
              <Input
                id={field}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
          <p className="text-sm font-medium">Enforce tenant quotas</p>
          <Switch
            checked={form.tenantQuotaEnforce}
            onCheckedChange={(v) => setForm({ ...form, tenantQuotaEnforce: v })}
          />
        </div>
      </SettingsSection>

      <SettingsSection id="webhooks" title="Webhooks">
        <div className="max-w-lg space-y-1.5">
          <Label htmlFor="webhook-hosts">Platform allowed hosts</Label>
          <Input
            id="webhook-hosts"
            value={form.platformWebhookHosts}
            onChange={(e) => setForm({ ...form, platformWebhookHosts: e.target.value })}
            placeholder="hooks.internal.example.com"
            className="h-9 font-mono text-sm"
          />
        </div>
        <SettingsFormFooter
          dirty={dirty}
          saving={saveMutation.isPending}
          onSave={save}
          onCancel={() => baseline && setForm(JSON.parse(baseline))}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
