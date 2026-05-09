"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";
import { clearScopeContext, switchScopeContext } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const {
    tenantId,
    projectId,
    token,
    mappingVersion,
    isBootstrapped,
    accessibleScopes,
    tenantOptions,
    projectOptions,
    isScopeLoading,
    setTenantId,
    setProjectId,
    setToken,
    setMappingVersion,
    refreshBootstrap
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [scopeTransactionLoading, setScopeTransactionLoading] = useState(false);

  const switchScope = useCallback(
    async (nextTenantId: string, nextProjectId: string) => {
      if (!token.trim()) return;
      setScopeTransactionLoading(true);
      try {
        try {
          const out = await switchScopeContext(token, {
            tenant_id: nextTenantId,
            project_id: nextProjectId,
            expected_mapping_version: mappingVersion
          });
          setTenantId(out.effective_scope.tenant_id);
          setProjectId(out.effective_scope.project_id);
          setMappingVersion(out.effective_scope.mapping_version || 1);
        } catch (e: unknown) {
          const msg = String((e as { message?: string })?.message || "");
          if (msg.includes("mapping_version_stale")) {
            await refreshBootstrap({ withSpinner: false });
            const out = await switchScopeContext(token, { tenant_id: nextTenantId, project_id: nextProjectId });
            setTenantId(out.effective_scope.tenant_id);
            setProjectId(out.effective_scope.project_id);
            setMappingVersion(out.effective_scope.mapping_version || 1);
          } else {
            throw e;
          }
        }
        await refreshBootstrap({ withSpinner: false });
      } finally {
        setScopeTransactionLoading(false);
      }
    },
    [token, mappingVersion, setTenantId, setProjectId, setMappingVersion, refreshBootstrap]
  );

  const scopeBusy = isScopeLoading || scopeTransactionLoading;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="text-brand font-semibold tracking-tight text-foreground">MLAir</div>
        <form
          className="flex"
          onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            router.push(`/search?q=${encodeURIComponent(q.trim())}&type=all`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-80 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Search run, task error, dataset…"
          />
        </form>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary"
          title="Switch light/dark theme"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <select
          value={tenantId}
          disabled={!isBootstrapped || scopeBusy}
          onChange={async (e) => {
            const t = String(e.target.value || "").trim();
            const nextProjects = accessibleScopes
              .filter((s) => String(s.tenant_id || "").trim() === t)
              .map((s) => String(s.project_id || "").trim())
              .filter(Boolean);
            const unique = Array.from(new Set(nextProjects));
            const nextProject = unique.includes(projectId) ? projectId : unique[0] || "default_project";
            await switchScope(t, nextProject);
          }}
          className="min-w-40 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          {tenantOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select
          value={projectId}
          disabled={!isBootstrapped || scopeBusy}
          onChange={async (e) => {
            const p = String(e.target.value || "").trim();
            await switchScope(tenantId, p);
          }}
          className="min-w-44 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          {projectOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-64 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          placeholder="admin-token / maintainer-token / jwt..."
        />
        <button
          type="button"
          onClick={() => void refreshBootstrap()}
          disabled={scopeBusy}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
        >
          {scopeBusy ? "Loading..." : "Bootstrap"}
        </button>
        <button
          type="button"
          onClick={async () => {
            setScopeTransactionLoading(true);
            try {
              await clearScopeContext(token);
              await refreshBootstrap({ withSpinner: false });
            } finally {
              setScopeTransactionLoading(false);
            }
          }}
          disabled={scopeBusy}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
          title="Clear persisted scope override"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
