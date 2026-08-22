"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ConfirmDestructiveDialog,
  DangerZone,
  DangerZoneAction,
  IdentityStatusBadge,
  LifecycleAction,
  MetadataList,
  SettingsEmptyState,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import {
  SA_PERMISSION_CATALOG,
  addServiceAccountScope,
  deleteServiceAccount,
  deleteServiceAccountScope,
  getServiceAccount,
  getServiceAccountPermissions,
  issueServiceAccountSecret,
  listServiceAccountCredentials,
  listServiceAccountScopes,
  patchServiceAccount,
  putServiceAccountPermissions,
  revokeServiceAccountCredential,
  rotateServiceAccountSecret,
  fetchTenantsForAdmin,
  fetchTenantProjectsForAdmin,
} from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentityServiceAccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const saId = String(params.saId || "");
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsBaseline, setPermissionsBaseline] = useState<string[]>([]);
  const [permInit, setPermInit] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionBaseline, setDescriptionBaseline] = useState("");
  const [descInit, setDescInit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showSecret, setShowSecret] = useState<{ token_id: string; secret: string } | null>(null);
  const [scopeTenant, setScopeTenant] = useState("default");
  const [scopeAll, setScopeAll] = useState(true);
  const [scopeProjects, setScopeProjects] = useState<string[]>([]);
  const [tenantOptions, setTenantOptions] = useState<string[]>(["default"]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  const saQuery = useQuery({
    queryKey: ["identity-sa-detail", saId, token],
    queryFn: () => getServiceAccount(token, saId),
    enabled: Boolean(token && saId),
  });

  const permsQuery = useQuery({
    queryKey: ["identity-sa-perms", saId, token],
    queryFn: () => getServiceAccountPermissions(token, saId),
    enabled: Boolean(token && saId),
  });

  const credsQuery = useQuery({
    queryKey: ["identity-sa-creds", saId, token],
    queryFn: () => listServiceAccountCredentials(token, saId),
    enabled: Boolean(token && saId),
  });

  const scopesQuery = useQuery({
    queryKey: ["identity-sa-scopes", saId, token],
    queryFn: () => listServiceAccountScopes(token, saId),
    enabled: Boolean(token && saId),
  });

  useEffect(() => {
    if (!permInit && permsQuery.data) {
      setPermissions(permsQuery.data);
      setPermissionsBaseline(permsQuery.data);
      setPermInit(true);
    }
  }, [permsQuery.data, permInit]);

  useEffect(() => {
    if (!descInit && saQuery.data) {
      const desc = saQuery.data.description || "";
      setDescription(desc);
      setDescriptionBaseline(desc);
      setDescInit(true);
    }
  }, [saQuery.data, descInit]);

  const descriptionDirty = description !== descriptionBaseline;
  const permissionsDirty = useMemo(
    () => JSON.stringify([...permissions].sort()) !== JSON.stringify([...permissionsBaseline].sort()),
    [permissions, permissionsBaseline],
  );

  const saveDescription = useMutation({
    mutationFn: () => patchServiceAccount(token, saId, { description: description.trim() || "" }),
    onSuccess: () => {
      setDescriptionBaseline(description);
      qc.invalidateQueries({ queryKey: ["identity-sa-detail", saId] });
      toast({ title: "Description saved" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Save failed", description: formatApiClientError(e) });
    },
  });

  const setState = useMutation({
    mutationFn: (state: string) => patchServiceAccount(token, saId, { state }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-detail", saId] });
      toast({ title: "Service account updated" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Update failed", description: formatApiClientError(e) });
    },
  });

  const deleteSa = useMutation({
    mutationFn: () => deleteServiceAccount(token, saId),
    onSuccess: async () => {
      setDeleteOpen(false);
      await qc.invalidateQueries({ queryKey: ["identity-sa"] });
      toast({ title: "Service account deleted" });
      router.push("/identity/service-accounts");
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Delete failed", description: formatApiClientError(e) });
    },
  });

  const savePerms = useMutation({
    mutationFn: () => putServiceAccountPermissions(token, saId, permissions),
    onSuccess: () => {
      setPermissionsBaseline(permissions);
      qc.invalidateQueries({ queryKey: ["identity-sa-perms", saId] });
      toast({ title: "Permissions saved" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Save failed", description: formatApiClientError(e) });
    },
  });

  const issue = useMutation({
    mutationFn: () => issueServiceAccountSecret(token, saId),
    onSuccess: (data) => {
      setShowSecret({ token_id: data.token_id, secret: data.secret });
      qc.invalidateQueries({ queryKey: ["identity-sa-creds", saId] });
      toast({ title: "Token generated", description: "Copy the token now — shown once." });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Generate failed", description: formatApiClientError(e) });
    },
  });

  const rotate = useMutation({
    mutationFn: () => rotateServiceAccountSecret(token, saId),
    onSuccess: (data) => {
      setShowSecret({ token_id: data.token_id, secret: data.secret });
      qc.invalidateQueries({ queryKey: ["identity-sa-creds", saId] });
      toast({ title: "Token regenerated" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Regenerate failed", description: formatApiClientError(e) });
    },
  });

  const addScope = useMutation({
    mutationFn: () =>
      addServiceAccountScope(token, saId, {
        tenant_id: scopeTenant,
        all_projects: scopeAll,
        project_ids: scopeAll ? [] : scopeProjects,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-scopes", saId] });
      toast({ title: "Scope added" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Add scope failed", description: formatApiClientError(e) });
    },
  });

  const removeScope = useMutation({
    mutationFn: (scopeId: string) => deleteServiceAccountScope(token, saId, scopeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-scopes", saId] });
      toast({ title: "Scope removed" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Remove scope failed", description: formatApiClientError(e) });
    },
  });

  const revokeCredential = useMutation({
    mutationFn: (tokenId: string) => revokeServiceAccountCredential(token, saId, tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-creds", saId] });
      toast({ title: "Token revoked" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Revoke failed", description: formatApiClientError(e) });
    },
  });

  async function loadTenants() {
    setTenantOptions(await fetchTenantsForAdmin(token));
  }

  async function loadProjects() {
    const p = await fetchTenantProjectsForAdmin(token, scopeTenant);
    setProjectOptions(p.map((x) => x.project_id));
  }

  const sa = saQuery.data;
  const lastUsed = (credsQuery.data || [])
    .map((c) => c.last_used_at)
    .filter(Boolean)
    .sort()
    .pop();
  const activeTokens = (credsQuery.data || []).filter((c) => !c.revoked_at);

  return (
    <SettingsPage loading={saQuery.isLoading} error={saQuery.error ? (saQuery.error as Error).message : null}>
      <SettingsPageHeader
        title={sa?.name || "Service account"}
        breadcrumb={{
          listHref: "/identity/service-accounts",
          listLabel: "Service accounts",
          currentLabel: sa?.name ?? saId,
          currentMono: !sa?.name,
          middleSegments: sa?.name ? [{ label: saId, mono: true }] : [],
        }}
        badge={sa ? <IdentityStatusBadge state={sa.state} /> : null}
      />

      {sa ? (
        <>
          <SettingsSection id="general" title="General">
            <div className="space-y-1.5">
              <Label htmlFor="sa-description">Description</Label>
              <Textarea
                id="sa-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="min-h-[100px] resize-y text-sm"
                placeholder="What this service account is used for…"
              />
            </div>
            <SettingsFormFooter
              dirty={descriptionDirty}
              saving={saveDescription.isPending}
              onSave={() => saveDescription.mutate()}
              onCancel={() => setDescription(descriptionBaseline)}
            />
          </SettingsSection>

          <SettingsSection id="metadata" title="Metadata">
            <MetadataList
              items={[
                { label: "Account ID", value: saId, mono: true },
                { label: "Name", value: sa.name, mono: true },
                { label: "Status", value: <IdentityStatusBadge state={sa.state} /> },
                { label: "Created", value: formatWhen(sa.created_at) },
                { label: "Last used", value: formatWhen(lastUsed) },
                { label: "Active tokens", value: String(activeTokens.length) },
              ]}
            />
          </SettingsSection>

          <SettingsSection id="permissions" title="Permissions">
            <div className="grid gap-2 sm:grid-cols-2">
              {SA_PERMISSION_CATALOG.map((perm) => (
                <label key={perm} className="flex items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 text-sm">
                  <Checkbox
                    checked={permissions.includes(perm)}
                    onCheckedChange={(checked) => {
                      setPermissions((prev) => (checked ? [...prev, perm] : prev.filter((p) => p !== perm)));
                    }}
                  />
                  <code className="text-xs">{perm}</code>
                </label>
              ))}
            </div>
            <SettingsFormFooter
              dirty={permissionsDirty}
              saving={savePerms.isPending}
              onSave={() => savePerms.mutate()}
              onCancel={() => setPermissions(permissionsBaseline)}
            />
          </SettingsSection>

          <SettingsSection id="scopes" title="Scopes">
            {(scopesQuery.data || []).length === 0 ? (
              <SettingsEmptyState
                title="No scopes configured"
                actionLabel="Add scope below"
                onAction={() => document.getElementById("sa-scope-form")?.scrollIntoView({ behavior: "smooth" })}
              />
            ) : (
              <ul className="mb-4 divide-y divide-border/60 rounded-md border border-border/60">
                {(scopesQuery.data || []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-mono text-xs">
                      {s.tenant_id} · {s.all_projects ? "all projects" : s.project_ids.join(", ")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => removeScope.mutate(s.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div id="sa-scope-form" className="space-y-3 rounded-md border border-border/60 bg-muted/15 p-4">
              <p className="text-xs font-medium text-muted-foreground">Add scope</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tenant</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={scopeTenant}
                    onFocus={() => void loadTenants()}
                    onChange={(e) => setScopeTenant(e.target.value)}
                  >
                    {tenantOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 pt-7 text-sm">
                  <Checkbox checked={scopeAll} onCheckedChange={(c) => setScopeAll(Boolean(c))} />
                  All projects in tenant
                </label>
              </div>
              {!scopeAll ? (
                <div className="space-y-2">
                  <Button variant="outline" size="sm" type="button" onClick={() => void loadProjects()}>
                    Load projects
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {projectOptions.map((pid) => (
                      <label key={pid} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={scopeProjects.includes(pid)}
                          onChange={() =>
                            setScopeProjects((prev) =>
                              prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
                            )
                          }
                        />
                        {pid}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <Button size="sm" type="button" onClick={() => addScope.mutate()} disabled={addScope.isPending}>
                Add scope
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection
            id="tokens"
            title="API tokens"
          >
            {activeTokens.length === 0 && !showSecret ? (
              <SettingsEmptyState
                title="No active tokens"
                actionLabel="Generate token"
                onAction={() => issue.mutate()}
              />
            ) : (
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {(credsQuery.data || []).map((c) => (
                  <li key={c.token_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs">{c.token_id}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatWhen(c.created_at)} · Last used {formatWhen(c.last_used_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <IdentityStatusBadge state={c.revoked_at ? "revoked" : "active"} />
                      {!c.revoked_at ? (
                        <Button variant="ghost" size="sm" onClick={() => revokeCredential.mutate(c.token_id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {showSecret ? (
              <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-foreground">Copy this token now — it will not be shown again</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">ID: {showSecret.token_id}</p>
                <Input readOnly value={showSecret.secret} className="mt-2 font-mono text-xs" />
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection id="lifecycle" title="Lifecycle">
            <div className="space-y-3">
              <LifecycleAction
                title="Enable account"
                actionLabel="Enable"
                disabled={sa.state === "active"}
                pending={setState.isPending}
                onAction={() => setState.mutate("active")}
              />
              <LifecycleAction
                title="Disable account"
                actionLabel="Disable"
                disabled={sa.state === "created"}
                pending={setState.isPending}
                onAction={() => setState.mutate("created")}
              />
              <LifecycleAction
                title="Generate token"
                actionLabel="Generate token"
                pending={issue.isPending}
                onAction={() => issue.mutate()}
              />
              <LifecycleAction
                title="Regenerate token"
                actionLabel="Regenerate"
                pending={rotate.isPending}
                onAction={() => rotate.mutate()}
              />
            </div>
          </SettingsSection>

          <DangerZone>
            <DangerZoneAction
              title="Delete service account"
              action={
                <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete account
                </Button>
              }
            />
          </DangerZone>

          <ConfirmDestructiveDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete service account "${sa.name}"?`}
            description="This action permanently removes the service account from the platform."
            impact={[
              "All authentication tokens are invalidated immediately.",
              "Running workers using this account will stop authenticating.",
              "Scopes and permissions cannot be recovered.",
            ]}
            confirmText={sa.name}
            pending={deleteSa.isPending}
            onConfirm={() => deleteSa.mutate()}
          />
        </>
      ) : null}
    </SettingsPage>
  );
}
