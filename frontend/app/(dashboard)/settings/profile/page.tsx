"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  clearProfileAvatar,
  loadProfileAvatar,
  readImageFileAsDataUrl,
  saveProfileAvatar,
} from "@/lib/profile-avatar";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const deltaSec = Math.round((then - now) / 1000);
    const abs = Math.abs(deltaSec);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 60) return rtf.format(deltaSec, "second");
    const mins = Math.round(deltaSec / 60);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(deltaSec / 3600);
    if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
    const days = Math.round(deltaSec / 86400);
    if (Math.abs(days) < 30) return rtf.format(days, "day");
    return formatWhen(iso);
  } catch {
    return formatWhen(iso);
  }
}

export default function SettingsProfilePage() {
  const { token, username, isGlobalAdmin } = useAppContext();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

  useEffect(() => {
    setAvatarUrl(loadProfileAvatar(meQuery.data?.id));
  }, [meQuery.data?.id]);

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
  const initial = (me?.display_name || me?.username || username || "?").slice(0, 1).toUpperCase();

  const onPickAvatar = async (file: File | null) => {
    if (!file || !me?.id) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      saveProfileAvatar(me.id, dataUrl);
      setAvatarUrl(dataUrl);
      toastSuccess("Avatar updated");
    } catch (e) {
      toastError("Avatar update failed", String((e as Error)?.message || e));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onRemoveAvatar = () => {
    if (!me?.id) return;
    clearProfileAvatar(me.id);
    setAvatarUrl(null);
    toastSuccess("Avatar removed");
  };

  return (
    <SettingsPage loading={meQuery.isLoading} error={meQuery.error ? String((meQuery.error as Error).message) : null}>
      <SettingsPageHeader
        title="Profile"
        description="Manage your personal account information."
      />

      {me ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <SettingsSection id="avatar" bare>
              <div className="flex flex-col items-center justify-center gap-4 py-2">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-3xl font-semibold text-primary">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <div className="flex w-full flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full transition-colors duration-150"
                    disabled={!me.id}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change avatar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors duration-150"
                    disabled={!me.id || !avatarUrl}
                    onClick={onRemoveAvatar}
                  >
                    Remove avatar
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              id="general"
              title="General"
              description="Update your account information."
              headerActions={
                <SettingsFormFooter
                  dirty={dirty}
                  alwaysShow
                  saving={saveMutation.isPending}
                  onSave={() => saveMutation.mutate()}
                  onCancel={() => {
                    setDisplayName(baseline.displayName);
                    setEmail(baseline.email);
                  }}
                />
              }
            >
              <div className="grid max-w-xl gap-5">
                <div className="space-y-2">
                  <Label htmlFor="display-name" className="text-[13px]">
                    Display name
                  </Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-9 text-sm"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[13px]">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 text-sm"
                    autoComplete="email"
                  />
                </div>
              </div>
            </SettingsSection>
          </div>

          <SettingsSection
            id="metadata"
            title="Metadata"
            description="Account details from the identity service."
          >
            <MetadataList
              items={[
                { label: "Username", value: me.username || username, mono: true },
                {
                  label: "Account type",
                  value: isGlobalAdmin || me.is_global_admin ? "Global administrator" : "Scoped user",
                },
                { label: "Status", value: <IdentityStatusBadge state={me.state || "active"} /> },
                { label: "Created", value: formatWhen(me.created_at) },
                { label: "Last login", value: formatRelative(me.last_login_at) },
              ]}
            />
          </SettingsSection>

          <SettingsSection
            id="permissions"
            title="Permissions"
            description="Your effective platform permissions."
          >
            {me.assignments?.length ? (
              <ul className="divide-y divide-border">
                {me.assignments.map((a) => (
                  <li key={a.id} className="py-4 font-mono text-[13px] text-muted-foreground first:pt-0 last:pb-0">
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
              <SettingsEmptyState title="No scoped assignments" />
            )}
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
