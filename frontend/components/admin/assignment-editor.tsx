"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type AssignmentInput,
  fetchTenantProjectsForAdmin,
  fetchTenantsForAdmin,
} from "@/lib/identity-admin-api";

export type AssignmentDraft = AssignmentInput & { _key: string };

export function createAssignmentDraft(): AssignmentDraft {
  return newDraft();
}

function newDraft(): AssignmentDraft {
  return {
    _key: crypto.randomUUID(),
    tenant_id: "default",
    role: "viewer",
    all_projects: true,
    project_ids: [],
  };
}

type Props = {
  token: string;
  value: AssignmentDraft[];
  onChange: (next: AssignmentDraft[]) => void;
  disabled?: boolean;
};

export function AssignmentEditor({ token, value, onChange, disabled }: Props) {
  const [tenants, setTenants] = useState<string[]>(["default"]);
  const [projectsByTenant, setProjectsByTenant] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!token.trim()) return;
    fetchTenantsForAdmin(token).then(setTenants).catch(() => setTenants(["default"]));
  }, [token]);

  const loadProjects = useCallback(
    async (tenantId: string) => {
      if (!token.trim() || projectsByTenant[tenantId]) return;
      const items = await fetchTenantProjectsForAdmin(token, tenantId);
      setProjectsByTenant((prev) => ({
        ...prev,
        [tenantId]: items.map((p) => p.project_id).filter(Boolean),
      }));
    },
    [token, projectsByTenant],
  );

  function updateRow(key: string, patch: Partial<AssignmentDraft>) {
    onChange(value.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    onChange(value.filter((row) => row._key !== key));
  }

  return (
    <div className="space-y-4">
      {value.map((row) => {
        const projects = projectsByTenant[row.tenant_id] || [];
        return (
          <div key={row._key} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tenant</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={row.tenant_id}
                  disabled={disabled}
                  onChange={(e) => {
                    const tenant_id = e.target.value;
                    updateRow(row._key, { tenant_id, project_ids: [] });
                    void loadProjects(tenant_id);
                  }}
                >
                  {tenants.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <div className="flex gap-4 pt-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`role-${row._key}`}
                      checked={row.role === "maintainer"}
                      disabled={disabled}
                      onChange={() => updateRow(row._key, { role: "maintainer" })}
                    />
                    Maintainer
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`role-${row._key}`}
                      checked={row.role === "viewer"}
                      disabled={disabled}
                      onChange={() => updateRow(row._key, { role: "viewer" })}
                    />
                    Viewer
                  </label>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={row.all_projects}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  updateRow(row._key, {
                    all_projects: Boolean(checked),
                    project_ids: checked ? [] : row.project_ids,
                  })
                }
              />
              All projects in tenant
            </label>
            {!row.all_projects ? (
              <div className="space-y-2">
                <Label>Selected projects</Label>
                <div className="flex flex-wrap gap-2">
                  {(projects.length ? projects : ["default_project"]).map((pid) => {
                    const checked = row.project_ids.includes(pid);
                    return (
                      <label key={pid} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            const next = checked
                              ? row.project_ids.filter((x) => x !== pid)
                              : [...row.project_ids, pid];
                            updateRow(row._key, { project_ids: next });
                          }}
                        />
                        {pid}
                      </label>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void loadProjects(row.tenant_id)}
                >
                  Load projects
                </Button>
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => removeRow(row._key)}>
                Remove
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...value, newDraft()])}
      >
        Add assignment
      </Button>
    </div>
  );
}

export function assignmentsToDrafts(
  rows: Array<{
    tenant_id: string;
    role: string;
    all_projects: boolean;
    project_ids: string[];
  }>,
): AssignmentDraft[] {
  return rows.map((r) => ({
    _key: crypto.randomUUID(),
    tenant_id: r.tenant_id,
    role: r.role === "maintainer" ? "maintainer" : "viewer",
    all_projects: r.all_projects,
    project_ids: r.project_ids || [],
  }));
}

export function draftsToAssignments(drafts: AssignmentDraft[]): AssignmentInput[] {
  return drafts.map(({ tenant_id, role, all_projects, project_ids }) => ({
    tenant_id,
    role,
    all_projects,
    project_ids,
  }));
}
