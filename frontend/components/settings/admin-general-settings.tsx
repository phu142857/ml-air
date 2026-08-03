"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
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
import { HUB_ROUTES } from "@/lib/system-settings-api";
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

export function AdminGeneralSettings() {
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
        title="General"
        description="Platform-wide Hub defaults."
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

      <SettingsSection id="configuration" title="Configuration">
        <div className="max-w-xs space-y-1.5">
          <Label>Default Hub route</Label>
          <Select value={form.hubRoute} onValueChange={(v) => setForm({ ...form, hubRoute: v })}>
            <SelectTrigger className="h-9 text-sm">
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
        <SettingsFormFooter
          dirty={dirty}
          saving={saveMutation.isPending}
          onSave={() => {
            saveMutation.mutate(partialFromForm(form, ["hub"]), {
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
