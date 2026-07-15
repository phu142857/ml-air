"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailSection } from "@/components/mlops/layout";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import {
  SA_PERMISSION_CATALOG,
  addServiceAccountScope,
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

export default function IdentityServiceAccountDetailPage() {
  const params = useParams();
  const saId = String(params.saId || "");
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permInit, setPermInit] = useState(false);
  const [description, setDescription] = useState("");
  const [descInit, setDescInit] = useState(false);
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
      setPermInit(true);
    }
  }, [permsQuery.data, permInit]);

  useEffect(() => {
    if (!descInit && saQuery.data) {
      setDescription(saQuery.data.description || "");
      setDescInit(true);
    }
  }, [saQuery.data, descInit]);

  const saveDescription = useMutation({
    mutationFn: () => patchServiceAccount(token, saId, { description: description.trim() || "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-detail", saId] });
      toast({ title: "Description updated" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Update failed", description: formatApiClientError(e) });
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

  const savePerms = useMutation({
    mutationFn: () => putServiceAccountPermissions(token, saId, permissions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-sa-perms", saId] });
      toast({ title: "Permissions saved" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Save permissions failed", description: formatApiClientError(e) });
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
      toast({ variant: "destructive", title: "Generate token failed", description: formatApiClientError(e) });
    },
  });

  const rotate = useMutation({
    mutationFn: () => rotateServiceAccountSecret(token, saId),
    onSuccess: (data) => {
      setShowSecret({ token_id: data.token_id, secret: data.secret });
      qc.invalidateQueries({ queryKey: ["identity-sa-creds", saId] });
      toast({ title: "Token regenerated", description: "Copy the new token now — shown once." });
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
      toast({ variant: "destructive", title: "Revoke token failed", description: formatApiClientError(e) });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{sa?.name || "Service account"}</h2>
          <p className="font-mono text-xs text-muted-foreground">{saId}</p>
        </div>
        <Link href="/identity/service-accounts" className="text-sm text-muted-foreground hover:underline">
          Back
        </Link>
      </div>

      <DetailSection title="Account" description="Status, description, and lifecycle">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="capitalize">{sa?.state || "…"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Created</span>
            <p className="font-mono text-xs">{sa?.created_at || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last used</span>
            <p className="font-mono text-xs">{lastUsed || "—"}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => saveDescription.mutate()} disabled={saveDescription.isPending}>
            Save description
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={sa?.state === "active"} onClick={() => setState.mutate("active")}>
            Enable
          </Button>
          <Button size="sm" variant="outline" disabled={sa?.state === "disabled"} onClick={() => setState.mutate("disabled")}>
            Disable
          </Button>
          <Button size="sm" variant="destructive" disabled={sa?.state === "revoked"} onClick={() => setState.mutate("revoked")}>
            Soft delete
          </Button>
        </div>
      </DetailSection>

      <DetailSection title="Permissions">
        <div className="grid gap-2 sm:grid-cols-2">
          {SA_PERMISSION_CATALOG.map((perm) => (
            <label key={perm} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions.includes(perm)}
                onCheckedChange={(checked) => {
                  setPermissions((prev) => (checked ? [...prev, perm] : prev.filter((p) => p !== perm)));
                }}
              />
              <code>{perm}</code>
            </label>
          ))}
        </div>
        <Button size="sm" className="mt-3" onClick={() => savePerms.mutate()}>
          Save permissions
        </Button>
      </DetailSection>

      <DetailSection title="Scopes">
        <ul className="mb-3 space-y-1 text-sm">
          {(scopesQuery.data || []).map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded border px-2 py-1">
              <span>
                {s.tenant_id} · {s.all_projects ? "all projects" : s.project_ids.join(", ")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeScope.mutate(s.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Tenant</Label>
            <select
              className="w-full rounded-md border px-2 py-1 text-sm"
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
          <label className="flex items-center gap-2 pt-6 text-sm">
            <Checkbox checked={scopeAll} onCheckedChange={(c) => setScopeAll(Boolean(c))} />
            All projects
          </label>
        </div>
        {!scopeAll ? (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => void loadProjects()}>
              Load projects
            </Button>
            <div className="mt-2 flex flex-wrap gap-2">
              {projectOptions.map((pid) => (
                <label key={pid} className="flex items-center gap-1 text-xs">
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
        <Button size="sm" className="mt-3" onClick={() => addScope.mutate()}>
          Add scope
        </Button>
      </DetailSection>

      <DetailSection title="Tokens" description="Generate, reveal once, regenerate, or revoke. Tokens cannot be edited.">
        <div className="mb-2 flex gap-2">
          <Button size="sm" onClick={() => issue.mutate()}>
            Generate token
          </Button>
          <Button size="sm" variant="outline" onClick={() => rotate.mutate()}>
            Regenerate token
          </Button>
        </div>
        {showSecret ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Shown once — copy now</p>
            <p className="font-mono text-xs">token_id: {showSecret.token_id}</p>
            <Input readOnly value={showSecret.secret} className="mt-2 font-mono text-xs" />
          </div>
        ) : null}
        <ul className="mt-3 space-y-1 text-sm">
          {(credsQuery.data || []).map((c) => (
            <li key={c.token_id} className="flex items-center justify-between rounded border px-2 py-1">
              <span className="font-mono text-xs">{c.token_id}</span>
              <span className="text-muted-foreground">{c.revoked_at ? "revoked" : "active"}</span>
              <span className="text-xs text-muted-foreground">{c.last_used_at || "never used"}</span>
              {!c.revoked_at ? (
                <Button variant="ghost" size="sm" onClick={() => revokeCredential.mutate(c.token_id)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  );
}
