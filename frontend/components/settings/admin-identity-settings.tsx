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

export function AdminIdentitySettings() {
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
        title="Identity & Access"
        description="Lockout, password, and bootstrap policy for the platform."
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

      <SettingsSection id="lockout" title="Lockout & password">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lockout-threshold">Lockout threshold (failed logins)</Label>
            <Input
              id="lockout-threshold"
              value={form.lockoutThreshold}
              onChange={(e) => setForm({ ...form, lockoutThreshold: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lockout-minutes">Lockout duration (minutes)</Label>
            <Input
              id="lockout-minutes"
              value={form.lockoutMinutes}
              onChange={(e) => setForm({ ...form, lockoutMinutes: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-min">Password min length</Label>
            <Input
              id="password-min"
              value={form.passwordMinLength}
              onChange={(e) => setForm({ ...form, passwordMinLength: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access-ttl">Access token TTL (seconds)</Label>
            <Input
              id="access-ttl"
              value={form.accessTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, accessTokenTtlSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refresh-ttl">Refresh token TTL (seconds)</Label>
            <Input
              id="refresh-ttl"
              value={form.refreshTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, refreshTokenTtlSeconds: e.target.value })}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
        <SettingsFormFooter
          dirty={dirty}
          saving={saveMutation.isPending}
          onSave={() =>
            saveMutation.mutate(partialFromForm(form, ["identity"]), {
              onSuccess: () => setBaseline(JSON.stringify(form)),
            })
          }
          onCancel={() => baseline && setForm(JSON.parse(baseline))}
        />
      </SettingsSection>

      <SettingsSection id="bootstrap" title="Bootstrap">
        <p className="text-sm text-muted-foreground">
          Bootstrap admin username/password and JWT secrets remain in process{" "}
          <code className="text-xs">.env</code> (see Platform → Environment). Manage users and
          service accounts from Identity → Users / Service accounts.
        </p>
      </SettingsSection>
    </SettingsPage>
  );
}
