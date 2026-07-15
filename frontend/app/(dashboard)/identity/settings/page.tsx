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

export default function IdentitySettingsPage() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);

  if (query.isLoading) return <L4LoadingState />;
  if (query.isError) return <L4ErrorState error={query.error} />;
  if (!form || !doc) return null;

  return (
    <div className="space-y-6">
      <DetailSection
        title="Password policy"
        description="Minimum password length enforced on user creation and password changes."
        accentBorder="violet"
      >
        <div className="max-w-xs">
          <Label className="text-xs">Minimum password length</Label>
          <Input
            value={form.passwordMinLength}
            onChange={(e) => setForm({ ...form, passwordMinLength: e.target.value })}
            className="mt-1 h-8 font-mono text-xs"
          />
        </div>
      </DetailSection>

      <DetailSection title="Session TTL" description="Access and refresh token lifetimes for interactive login sessions.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Access token TTL (seconds)</Label>
            <Input
              value={form.accessTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, accessTokenTtlSeconds: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Refresh token TTL (seconds)</Label>
            <Input
              value={form.refreshTokenTtlSeconds}
              onChange={(e) => setForm({ ...form, refreshTokenTtlSeconds: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Lockout policy" description="Failed login threshold before account lockout.">
        <L4Meta doc={doc} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Lockout threshold (failed logins)</Label>
            <Input
              value={form.lockoutThreshold}
              onChange={(e) => setForm({ ...form, lockoutThreshold: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Lockout duration (minutes)</Label>
            <Input
              value={form.lockoutMinutes}
              onChange={(e) => setForm({ ...form, lockoutMinutes: e.target.value })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-4">
          <L4SaveBar
            saving={saveMutation.isPending}
            onSave={() => saveMutation.mutate(partialFromForm(form, ["identity"]))}
          />
        </div>
      </DetailSection>
    </div>
  );
}
