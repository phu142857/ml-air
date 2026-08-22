"use client";

import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { L4ErrorState, L4LoadingState } from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";
import { FEATURE_FLAG_META } from "@/lib/system-settings-api";

export function AdminFeaturesSettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation } = useL4SettingsForm(token);
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    if (form && baseline === null) setBaseline(JSON.stringify(form.features));
  }, [form, baseline]);

  const dirty = baseline !== null && form ? JSON.stringify(form.features) !== baseline : false;

  const groups = useMemo(() => {
    const map = new Map<string, typeof FEATURE_FLAG_META>();
    for (const meta of FEATURE_FLAG_META) {
      const list = map.get(meta.group) || [];
      list.push(meta);
      map.set(meta.group, list);
    }
    return Array.from(map.entries());
  }, []);

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
  if (!form) return null;

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Features"
      />
      <p className="text-sm text-muted-foreground">
        All policy feature flags from <code className="text-xs">.env.example</code> / L4{" "}
        <code className="text-xs">features.*</code>. Changes apply without editing process env
        (unless <code className="text-xs">ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1</code>).
      </p>

      {groups.map(([group, items]) => (
        <SettingsSection key={group} id={`features-${group}`} title={group}>
          <div className="space-y-2">
            {items.map((meta) => (
              <div
                key={meta.key}
                className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{meta.key}</p>
                </div>
                <Switch
                  checked={Boolean(form.features[meta.key])}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      features: { ...form.features, [meta.key]: v },
                      tenantQuotaEnforce:
                        meta.key === "tenant_quota_enforce" ? v : form.tenantQuotaEnforce,
                      skipApproval: meta.key === "skip_approval_for_promote" ? v : form.skipApproval,
                      allowSkipStages:
                        meta.key === "promotion_allow_skip_stages" ? v : form.allowSkipStages,
                      rollbackEnabled: meta.key === "rollback_enabled" ? v : form.rollbackEnabled,
                      rollbackRequiresApproval:
                        meta.key === "rollback_requires_approval"
                          ? v
                          : form.rollbackRequiresApproval,
                      replayRequireChecksum:
                        meta.key === "replay_require_checksum" ? v : form.replayRequireChecksum,
                      replayRequireSignedManifest:
                        meta.key === "replay_require_signed_manifest"
                          ? v
                          : form.replayRequireSignedManifest,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </SettingsSection>
      ))}

      <SettingsFormFooter
        dirty={dirty}
        saving={saveMutation.isPending}
        onSave={() =>
          saveMutation.mutate(partialFromForm(form, ["features"]), {
            onSuccess: () => setBaseline(JSON.stringify(form.features)),
          })
        }
        onCancel={() => {
          if (baseline) setForm({ ...form, features: JSON.parse(baseline) });
        }}
      />
    </SettingsPage>
  );
}
