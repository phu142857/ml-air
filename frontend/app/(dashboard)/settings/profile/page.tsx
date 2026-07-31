"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IdentityStatusBadge,
  MetadataList,
  SettingsEmptyState,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { fetchIdentityMe, patchIdentityMe } from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SettingsProfilePage() {
  const { token, username, isGlobalAdmin } = useAppContext();
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["identity-me", token],
    queryFn: () => fetchIdentityMe(token),
    enabled: Boolean(token.trim()),
  });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [baseline, setBaseline] = useState({ displayName: "", email: "" });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!meQuery.data || initialized) return;
    const next = {
      displayName: meQuery.data.display_name || "",
      email: meQuery.data.email || "",
    };
    setDisplayName(next.displayName);
    setEmail(next.email);
    setBaseline(next);
    setInitialized(true);
  }, [meQuery.data, initialized]);

  const dirty = displayName !== baseline.displayName || email !== baseline.email;

  const saveMutation = useMutation({
    mutationFn: () => patchIdentityMe(token, { display_name: displayName, email }),
    onSuccess: async () => {
      setBaseline({ displayName, email });
      toastSuccess("Profile saved");
      await queryClient.invalidateQueries({ queryKey: ["identity-me", token] });
    },
    onError: (e) => toastError("Save failed", String((e as Error)?.message || e)),
  });

  const me = meQuery.data;

  return (
    <SettingsPage loading={meQuery.isLoading} error={meQuery.error ? String((meQuery.error as Error).message) : null}>
      <SettingsPageHeader
        title="Profile"
        badge={
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {(me?.display_name || me?.username || username || "?").slice(0, 1).toUpperCase()}
          </div>
        }
      />

      {me ? (
        <>
          <SettingsSection id="general" title="General">
            <div className="grid max-w-lg gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-9"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                  autoComplete="email"
                />
              </div>
            </div>
            <SettingsFormFooter
              dirty={dirty}
              saving={saveMutation.isPending}
              onSave={() => saveMutation.mutate()}
              onCancel={() => {
                setDisplayName(baseline.displayName);
                setEmail(baseline.email);
              }}
            />
          </SettingsSection>

          <SettingsSection id="metadata" title="Metadata">
            <MetadataList
              items={[
                { label: "Username", value: me.username || username, mono: true },
                { label: "Account type", value: isGlobalAdmin || me.is_global_admin ? "Global administrator" : "Scoped user" },
                { label: "Status", value: <IdentityStatusBadge state={me.state || "active"} /> },
                { label: "Created", value: formatWhen(me.created_at) },
                { label: "Last login", value: formatWhen(me.last_login_at) },
              ]}
            />
          </SettingsSection>

          <SettingsSection id="permissions" title="Permissions">
            {me.assignments?.length ? (
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {me.assignments.map((a) => (
                  <li key={a.id} className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {a.tenant_id} · <span className="text-foreground">{a.role}</span>
                    {a.all_projects ? " · all projects" : ` · ${a.project_ids.join(", ")}`}
                  </li>
                ))}
              </ul>
            ) : isGlobalAdmin || me.is_global_admin ? (
              <p className="text-sm text-muted-foreground">
                Global administrators have platform-wide access. Scoped assignments do not apply.
              </p>
            ) : (
              <SettingsEmptyState
                title="No scoped assignments"
              />
            )}
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
