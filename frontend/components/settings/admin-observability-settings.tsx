"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function AdminObservabilitySettings() {
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

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Observability"
      />

      <SettingsSection id="metadata" title="Metadata">
        <MetadataList
          items={[
            { label: "Schema version", value: String(doc.schema_version), mono: true },
            { label: "Last updated", value: formatWhen(doc.updated_at) },
            { label: "Updated by", value: doc.updated_by || "—", mono: true },
          ]}
        />
      </SettingsSection>

      <SettingsSection id="configuration" title="Configuration">
        <div className="max-w-lg space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grafana-url">Grafana URL</Label>
            <Input
              id="grafana-url"
              value={form.grafanaUrl}
              onChange={(e) => setForm({ ...form, grafanaUrl: e.target.value })}
              placeholder="https://grafana.example.com"
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trace-retention">Trace span retention (days)</Label>
              <Input
                id="trace-retention"
                inputMode="numeric"
                value={form.traceRetentionDays}
                onChange={(e) => setForm({ ...form, traceRetentionDays: e.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trace-sample">Trace sample ratio (0–1)</Label>
              <Input
                id="trace-sample"
                value={form.traceSampleRatio}
                onChange={(e) => setForm({ ...form, traceSampleRatio: e.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>
        </div>
        <SettingsFormFooter
          dirty={dirty}
          saving={saveMutation.isPending}
          onSave={() => {
            saveMutation.mutate(partialFromForm(form, ["telemetry"]), {
              onSuccess: () => setBaseline(JSON.stringify(form)),
            });
          }}
          onCancel={() => baseline && setForm(JSON.parse(baseline))}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
