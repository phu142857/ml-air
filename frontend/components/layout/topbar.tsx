"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";
import { clearScopeContext, fetchBootstrapContext, switchScopeContext } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const {
    tenantId,
    projectId,
    token,
    mappingVersion,
    isBootstrapped,
    setTenantId,
    setProjectId,
    setToken,
    setMappingVersion
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [tenantOptions, setTenantOptions] = useState<string[]>(tenantId ? [tenantId] : ["default"]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [accessibleScopes, setAccessibleScopes] = useState<
    Array<{ tenant_id: string; project_id: string; role: string }>
  >([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const autoLoadedKeyRef = useRef<string>("");
  const loadBootstrap = useCallback(async () => {
    if (!token.trim()) return;
    setIsLoadingScope(true);
    try {
      const ctx = await fetchBootstrapContext(token);
      const scopes = ctx.accessible_scopes || [];
      setAccessibleScopes(scopes);
      const tenants = Array.from(new Set(scopes.map((s) => String(s.tenant_id || "").trim()).filter(Boolean)));
      setTenantOptions(tenants.length ? tenants : [ctx.effective_scope.tenant_id]);
      const effectiveTenant = String(ctx.effective_scope.tenant_id || "").trim();
      const projectsForTenant = scopes
        .filter((s) => String(s.tenant_id || "").trim() === effectiveTenant)
        .map((s) => String(s.project_id || "").trim())
        .filter(Boolean);
      setProjectOptions(Array.from(new Set(projectsForTenant)));
      setTenantId(ctx.effective_scope.tenant_id);
      setProjectId(ctx.effective_scope.project_id);
      setMappingVersion(ctx.effective_scope.mapping_version || 1);
    } finally {
      setIsLoadingScope(false);
    }
  }, [token, setTenantId, setProjectId, setMappingVersion]);

  useEffect(() => {
    if (!token || isLoadingScope) return;
    const key = `${token}`;
    if (autoLoadedKeyRef.current === key) return;
    autoLoadedKeyRef.current = key;
    void loadBootstrap();
  }, [token, isLoadingScope, loadBootstrap]);

  const switchScope = useCallback(
    async (nextTenantId: string, nextProjectId: string) => {
      if (!token.trim()) return;
      setIsLoadingScope(true);
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
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (msg.includes("mapping_version_stale")) {
            await loadBootstrap();
            const out = await switchScopeContext(token, { tenant_id: nextTenantId, project_id: nextProjectId });
            setTenantId(out.effective_scope.tenant_id);
            setProjectId(out.effective_scope.project_id);
            setMappingVersion(out.effective_scope.mapping_version || 1);
          } else {
            throw e;
          }
        }
        await loadBootstrap();
      } finally {
        setIsLoadingScope(false);
      }
    },
    [token, mappingVersion, setTenantId, setProjectId, setMappingVersion, loadBootstrap]
  );

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
          disabled={!isBootstrapped || isLoadingScope}
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
          disabled={!isBootstrapped || isLoadingScope}
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
          onClick={() => void loadBootstrap()}
          disabled={isLoadingScope}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
        >
          {isLoadingScope ? "Loading..." : "Bootstrap"}
        </button>
        <button
          type="button"
          onClick={async () => {
            setIsLoadingScope(true);
            try {
              await clearScopeContext(token);
              await loadBootstrap();
            } finally {
              setIsLoadingScope(false);
            }
          }}
          disabled={isLoadingScope}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
          title="Clear persisted scope override"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
