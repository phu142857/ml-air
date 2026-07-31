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
import { L4ErrorState, L4LoadingState } from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";
import { useAppContext } from "@/lib/app-context";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentitySettingsPage() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);
  const [baseline, setBaseline] = useState<string | null>(null);

  const serialized = form ? JSON.stringify(form) : "";
  const dirty = baseline !== null && serialized !== baseline;

  useEffect(() => {
    if (form && baseline === null) setBaseline(JSON.stringify(form));
  }, [form, baseline]);

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
        title="Authentication Policy"
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

      <SettingsSection id="password-policy" title="Password policy">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="min-password">Minimum password length</Label>
          <Input
            id="min-password"
            inputMode="numeric"
            value={form.passwordMinLength}
            onChange={(e) => setForm({ ...form, passwordMinLength: e.target.value })}
            className="h-9 font-mono text-sm"
          />
        </div>
      </SettingsSection>

      <SettingsSection id="session-ttl" title="Session TTL">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="access-ttl">Access token TTL (seconds)</Label>
            <Input
              id="access-ttl"
              inputMode="numeric"
              value={form.accessTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, accessTokenTtlSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refresh-ttl">Refresh token TTL (seconds)</Label>
            <Input
              id="refresh-ttl"
              inputMode="numeric"
              value={form.refreshTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, refreshTokenTtlSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="lockout" title="Lockout policy">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lockout-threshold">Failed login threshold</Label>
            <Input
              id="lockout-threshold"
              inputMode="numeric"
              value={form.lockoutThreshold}
              onChange={(e) => setForm({ ...form, lockoutThreshold: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lockout-minutes">Lockout duration (minutes)</Label>
            <Input
              id="lockout-minutes"
              inputMode="numeric"
              value={form.lockoutMinutes}
              onChange={(e) => setForm({ ...form, lockoutMinutes: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
        <SettingsFormFooter
          dirty={dirty}
          saving={saveMutation.isPending}
          onSave={() => {
            saveMutation.mutate(partialFromForm(form, ["identity"]), {
              onSuccess: () => setBaseline(JSON.stringify(form)),
            });
          }}
          onCancel={() => {
            if (baseline) setForm(JSON.parse(baseline));
          }}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
