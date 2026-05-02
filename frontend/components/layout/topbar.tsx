"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";
import { fetchTenantProjects, fetchTenants, fetchWhoAmI } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const { tenantId, projectId, token, setTenantId, setProjectId, setToken } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [tenantOptions, setTenantOptions] = useState<string[]>(tenantId ? [tenantId] : ["all"]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const autoLoadedKeyRef = useRef<string>("");
  const loadScope = useCallback(
    async (preferredTenant?: string) => {
      setIsLoadingScope(true);
      try {
        let resolvedTenant = String(preferredTenant || tenantId || "default").trim() || "default";
        let whoamiSkipped = false;
        const tenants = await fetchTenants(token);
        const mergedTenants = Array.from(new Set(["all", ...tenants]));
        setTenantOptions(mergedTenants);
        if (token) {
          try {
            const me = await fetchWhoAmI(token);
            const candidate = String(me.tenant_id || "").trim();
            if (candidate && mergedTenants.includes(candidate)) {
              resolvedTenant = candidate;
            }
          } catch {
            // Fallback: still load tenant projects even if whoami fails.
            whoamiSkipped = true;
          }
        }
        const projects = await fetchTenantProjects(resolvedTenant, token);
        setProjectOptions(projects);
        setTenantId(resolvedTenant);
        if (projectId !== "all" && !projects.includes(projectId)) {
          setProjectId("all");
        }
      } catch (e: any) {
        // Keep UI clean: fail silently here, fallback options remain usable.
        void e;
      } finally {
        setIsLoadingScope(false);
      }
    },
    [tenantId, token, projectId, setProjectId, setTenantId]
  );

  useEffect(() => {
    if (!token || isLoadingScope) return;
    const key = `${tenantId}::${token}`;
    if (autoLoadedKeyRef.current === key) return;
    autoLoadedKeyRef.current = key;
    void loadScope(tenantId);
  }, [tenantId, token, isLoadingScope, loadScope]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-sm">
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
          onChange={(e) => {
            const t = e.target.value;
            autoLoadedKeyRef.current = "";
            setTenantId(t);
            setProjectId("all");
            void loadScope(t);
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
          onChange={(e) => {
            const raw = e.target.value;
            setProjectId(raw);
          }}
          className="min-w-44 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          <option value="all">all</option>
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
          onClick={() => void loadScope()}
          disabled={isLoadingScope}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
        >
          {isLoadingScope ? "Loading..." : "Load Scope"}
        </button>
      </div>
    </header>
  );
}
