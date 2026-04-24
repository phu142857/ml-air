"use client";

import { useAppContext } from "@/lib/app-context";

export function Topbar() {
  const { tenantId, projectId, token, setTenantId, setProjectId, setToken } = useAppContext();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700 bg-bg-muted px-6">
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold">ML-AIR</div>
        <input
          className="w-80 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder="Search pipeline, run, task..."
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <input
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        />
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        />
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        />
        <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-800" />
      </div>
    </header>
  );
}
