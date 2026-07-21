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

export function AdminIdentitySettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);

  if (query.isLoading) return <L4LoadingState />;
  if (query.isError) return <L4ErrorState error={query.error} />;
  if (!form || !doc) return null;

  return (
    <div className="space-y-6">
      <DetailSection
        title="Identity & Access"
        accentBorder="violet"
      >
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

      <DetailSection
        title="Bootstrap status"
        accentBorder="none"
      >
        <p className="text-sm text-muted-foreground">
          Manage users and service accounts from{" "}
          <a href="/identity/users" className="text-primary hover:underline">
            Identity → Users
          </a>{" "}
          and{" "}
          <a href="/identity/service-accounts" className="text-primary hover:underline">
            Service accounts
          </a>
          . Platform identity policy is configured at{" "}
          <a href="/identity/settings" className="text-primary hover:underline">
            Identity → Settings
          </a>
          .
        </p>
      </DetailSection>
    </div>
  );
}
