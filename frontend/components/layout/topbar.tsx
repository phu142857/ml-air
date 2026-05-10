"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";
import { clearScopeContext, switchScopeContext } from "@/lib/api";

function ScopeDropdown({
  value,
  options,
  disabled,
  onPick,
  placeholder
}: {
  value: string;
  options: string[];
  disabled: boolean;
  onPick: (next: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const list = options.length ? Array.from(new Set(options)) : value ? [value] : [];

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className="flex min-w-[10.5rem] max-w-[14rem] items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-left text-sm text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="truncate font-medium text-foreground">{value || placeholder}</span>
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          ▾
        </span>
      </button>
      {open && list.length ? (
        <ul
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-[200] max-h-56 min-w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {list.map((opt) => (
            <li key={opt} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt === value}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                  opt === value ? "bg-muted/80 text-foreground" : "text-foreground"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  if (opt !== value) onPick(opt);
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
      } catch (err) {
        console.error("switchScope failed", err);
        try {
          await refreshBootstrap({ withSpinner: false });
        } catch {
          // ignore
        }
      } finally {
        setScopeTransactionLoading(false);
      }
    },
    [token, mappingVersion, setTenantId, setProjectId, setMappingVersion, refreshBootstrap]
  );

  const scopeBusy = isScopeLoading || scopeTransactionLoading;

  const tenantList = tenantOptions.length ? tenantOptions : tenantId ? [tenantId] : ["default"];
  const projectList = projectOptions.length ? projectOptions : projectId ? [projectId] : ["default_project"];

  return (
    <header className="sticky top-0 z-40 flex h-16 flex-nowrap items-center justify-between gap-2 overflow-visible border-b border-border bg-card/95 px-4 backdrop-blur-sm md:px-6">
      <div className="flex min-w-0 flex-1 shrink items-center gap-2 md:gap-3">
        <div className="flex shrink-0 items-center gap-2 text-brand font-semibold tracking-tight text-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
          MLAir
        </div>
        <form
          className="flex min-w-0 max-w-md flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            router.push(`/search?q=${encodeURIComponent(q.trim())}&type=all`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-0 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Search runs, tasks, datasets…"
          />
        </form>
        <kbd
          className="hidden shrink-0 rounded-md border border-border bg-muted px-2 py-1 font-mono text-overline text-muted-foreground lg:inline"
          title="Open command palette (⌘K or Ctrl+K)"
        >
          ⌘/Ctrl+K
        </kbd>
      </div>
      <div className="relative z-50 flex shrink-0 flex-nowrap items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary"
          title="Switch light/dark theme"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <ScopeDropdown
          value={tenantId}
          options={tenantList}
          disabled={scopeBusy}
          placeholder="Tenant"
          onPick={(t) => {
            const nextProjects = accessibleScopes
              .filter((s) => String(s.tenant_id || "").trim() === t)
              .map((s) => String(s.project_id || "").trim())
              .filter(Boolean);
            const unique = Array.from(new Set(nextProjects));
            const nextProject = unique.includes(projectId) ? projectId : unique[0] || "default_project";
            void switchScope(t, nextProject);
          }}
        />
        <ScopeDropdown
          value={projectId}
          options={projectList}
          disabled={scopeBusy}
          placeholder="Project"
          onPick={(p) => {
            void switchScope(tenantId, p);
          }}
        />
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-52 shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground md:w-64"
          placeholder="Bearer token…"
          title={!isBootstrapped ? "Loading scope from API…" : undefined}
        />
        <button
          type="button"
          onClick={() => void refreshBootstrap()}
          disabled={scopeBusy}
          className="shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
        >
          {scopeBusy ? "Loading…" : "Bootstrap"}
        </button>
        <button
          type="button"
          onClick={async () => {
            setScopeTransactionLoading(true);
            try {
              await clearScopeContext(token);
              await refreshBootstrap({ withSpinner: false });
            } catch (err) {
              console.error("clear scope failed", err);
            } finally {
              setScopeTransactionLoading(false);
            }
          }}
          disabled={scopeBusy}
          className="shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
          title="Clear persisted scope override"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
