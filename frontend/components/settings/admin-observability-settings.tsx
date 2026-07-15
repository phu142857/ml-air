"use client";

import { DetailSection } from "@/components/mlops/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/lib/app-context";
import {
  L4ErrorState,
  L4LoadingState,
  L4Meta,
  L4SaveBar,
} from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";

export function AdminObservabilitySettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);

  if (query.isLoading) return <L4LoadingState />;
  if (query.isError) return <L4ErrorState error={query.error} />;
  if (!form || !doc) return null;

  return (
    <DetailSection
      title="Observability"
      description="Grafana, tracing retention, and metrics sampling (L4 telemetry)."
      accentBorder="sky"
    >
      <L4Meta doc={doc} />
      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs">Grafana URL</Label>
          <Input
            value={form.grafanaUrl}
            onChange={(e) => setForm({ ...form, grafanaUrl: e.target.value })}
            placeholder="https://grafana.example.com"
            className="mt-1 h-8 font-mono text-xs"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Trace span retention (days)</Label>
            <Input
              value={form.traceRetentionDays}
              onChange={(e) => setForm({ ...form, traceRetentionDays: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Trace sample ratio (0–1)</Label>
            <Input
              value={form.traceSampleRatio}
              onChange={(e) => setForm({ ...form, traceSampleRatio: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
        <L4SaveBar
          saving={saveMutation.isPending}
          onSave={() => saveMutation.mutate(partialFromForm(form, ["telemetry"]))}
        />
      </div>
    </DetailSection>
  );
}
