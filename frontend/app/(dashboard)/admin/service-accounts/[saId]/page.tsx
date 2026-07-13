"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailSection, ResourcePageHeader } from "@/components/mlops/layout";
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
  putServiceAccountPermissions,
  revokeServiceAccount,
  revokeServiceAccountCredential,
  rotateServiceAccountSecret,
  fetchTenantsForAdmin,
  fetchTenantProjectsForAdmin,
} from "@/lib/identity-admin-api";

export default function AdminServiceAccountDetailPage() {
  const params = useParams();
  const saId = String(params.saId || "");
  const { token } = useAppContext();
  const qc = useQueryClient();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permInit, setPermInit] = useState(false);
  const [showSecret, setShowSecret] = useState<{ token_id: string; secret: string } | null>(null);
  const [scopeTenant, setScopeTenant] = useState("default");
  const [scopeAll, setScopeAll] = useState(true);
  const [scopeProjects, setScopeProjects] = useState<string[]>([]);
  const [tenantOptions, setTenantOptions] = useState<string[]>(["default"]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  const saQuery = useQuery({
    queryKey: ["admin-sa-detail", saId, token],
    queryFn: () => getServiceAccount(token, saId),
    enabled: Boolean(token && saId),
  });

  const permsQuery = useQuery({
    queryKey: ["admin-sa-perms", saId, token],
    queryFn: () => getServiceAccountPermissions(token, saId),
    enabled: Boolean(token && saId),
  });

  const credsQuery = useQuery({
    queryKey: ["admin-sa-creds", saId, token],
    queryFn: () => listServiceAccountCredentials(token, saId),
    enabled: Boolean(token && saId),
  });

  const scopesQuery = useQuery({
    queryKey: ["admin-sa-scopes", saId, token],
    queryFn: () => listServiceAccountScopes(token, saId),
    enabled: Boolean(token && saId),
  });

  useEffect(() => {
    if (!permInit && permsQuery.data) {
      setPermissions(permsQuery.data);
      setPermInit(true);
    }
  }, [permsQuery.data, permInit]);

  const savePerms = useMutation({
    mutationFn: () => putServiceAccountPermissions(token, saId, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sa-perms", saId] }),
  });

  const issue = useMutation({
    mutationFn: () => issueServiceAccountSecret(token, saId),
    onSuccess: (data) => {
      setShowSecret({ token_id: data.token_id, secret: data.secret });
      qc.invalidateQueries({ queryKey: ["admin-sa-creds", saId] });
    },
  });

  const rotate = useMutation({
    mutationFn: () => rotateServiceAccountSecret(token, saId),
    onSuccess: (data) => {
      setShowSecret({ token_id: data.token_id, secret: data.secret });
      qc.invalidateQueries({ queryKey: ["admin-sa-creds", saId] });
    },
  });

  const revokeSa = useMutation({
    mutationFn: () => revokeServiceAccount(token, saId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sa-detail", saId] }),
  });

  const addScope = useMutation({
    mutationFn: () =>
      addServiceAccountScope(token, saId, {
        tenant_id: scopeTenant,
        all_projects: scopeAll,
        project_ids: scopeAll ? [] : scopeProjects,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sa-scopes", saId] }),
  });

  async function loadTenants() {
    const t = await fetchTenantsForAdmin(token);
    setTenantOptions(t);
  }

  async function loadProjects() {
    const p = await fetchTenantProjectsForAdmin(token, scopeTenant);
    setProjectOptions(p.map((x) => x.project_id));
  }

  return (
    <div className="space-y-6 p-6">
      <ResourcePageHeader
        icon={Bot}
        accent="zinc"
        title={saQuery.data?.name || "Service account"}
        subtitle={saId}
        actions={
          <Link href="/admin/service-accounts" className="text-sm text-muted-foreground hover:underline">
            Back
          </Link>
        }
      />

      <DetailSection title="Account">
        <p className="text-sm">State: {saQuery.data?.state || "…"}</p>
        <Button variant="destructive" size="sm" className="mt-2" onClick={() => revokeSa.mutate()}>
          Revoke account
        </Button>
      </DetailSection>

      <DetailSection title="Permissions" description="Catalog 08">
        <div className="grid gap-2 sm:grid-cols-2">
          {SA_PERMISSION_CATALOG.map((perm) => (
            <label key={perm} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions.includes(perm)}
                onCheckedChange={(checked) => {
                  setPermissions((prev) =>
                    checked ? [...prev, perm] : prev.filter((p) => p !== perm),
                  );
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  deleteServiceAccountScope(token, saId, s.id).then(() =>
                    qc.invalidateQueries({ queryKey: ["admin-sa-scopes", saId] }),
                  )
                }
              >
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

      <DetailSection title="Credentials">
        <div className="mb-2 flex gap-2">
          <Button size="sm" onClick={() => issue.mutate()}>
            Issue secret
          </Button>
          <Button size="sm" variant="outline" onClick={() => rotate.mutate()}>
            Rotate
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
              {!c.revoked_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    revokeServiceAccountCredential(token, saId, c.token_id).then(() =>
                      qc.invalidateQueries({ queryKey: ["admin-sa-creds", saId] }),
                    )
                  }
                >
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
