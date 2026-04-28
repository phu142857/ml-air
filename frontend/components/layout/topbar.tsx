"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";
import { fetchTenantProjects, fetchWhoAmI } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const { tenantId, projectId, token, setTenantId, setProjectId, setToken } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [tenantOptions, setTenantOptions] = useState<string[]>(tenantId ? [tenantId] : ["default"]);
  const [projectOptions, setProjectOptions] = useState<string[]>(["default_project"]);
  const [scopeMsg, setScopeMsg] = useState("");
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const globalProjectLabel = useMemo(() => (projectId === "default_project" ? "global" : projectId), [projectId]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700 bg-bg-muted px-6">
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold">MLAir</div>
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
            className="w-80 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Search run, task error, dataset…"
          />
        </form>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          title="Switch light/dark theme"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="min-w-40 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          {tenantOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select
          value={globalProjectLabel}
          onChange={(e) => {
            const raw = e.target.value;
            setProjectId(raw === "global" ? "default_project" : raw);
          }}
          className="min-w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="global">global</option>
          <option value="all">all</option>
          {projectOptions
            .filter((p) => p !== "default_project")
            .map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
        </select>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder="admin-token / maintainer-token / jwt..."
        />
        <button
          type="button"
          onClick={async () => {
            setScopeMsg("");
            setIsLoadingScope(true);
            try {
              const me = await fetchWhoAmI(token);
              const t = String(me.tenant_id || tenantId || "default").trim() || "default";
              const projects = await fetchTenantProjects(t, token);
              setTenantOptions([t]);
              setProjectOptions(projects);
              setTenantId(t);
              if (!projects.includes(projectId)) {
                setProjectId("default_project");
              }
              setScopeMsg(`Loaded ${projects.length} projects`);
            } catch (e: any) {
              setScopeMsg(`Load scope failed: ${String(e?.message || e)}`);
            } finally {
              setIsLoadingScope(false);
            }
          }}
          disabled={isLoadingScope}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
        >
          {isLoadingScope ? "Loading..." : "Load Scope"}
        </button>
        {scopeMsg ? <span className="max-w-56 truncate text-sm text-slate-400">{scopeMsg}</span> : null}
      </div>
    </header>
  );
}
