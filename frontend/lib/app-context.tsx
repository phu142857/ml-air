"use client";

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BootstrapContextResponse } from "@/lib/api";
import { fetchBootstrapContext } from "@/lib/api";

export type AccessibleScopeRow = { tenant_id: string; project_id: string; role: string };

type AppContextValue = {
  tenantId: string;
  projectId: string;
  token: string;
  mappingVersion: number;
  bootstrapSource: string;
  isBootstrapped: boolean;
  accessibleScopes: AccessibleScopeRow[];
  tenantOptions: string[];
  projectOptions: string[];
  isScopeLoading: boolean;
  setTenantId: (value: string) => void;
  setProjectId: (value: string) => void;
  setToken: (value: string) => void;
  setMappingVersion: (value: number) => void;
  /** Re-fetch bootstrap; use `withSpinner: false` when an outer scope transaction already shows loading. */
  refreshBootstrap: (opts?: { withSpinner?: boolean }) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const STORAGE_KEY = "ml-air:ui-context";

function deriveScopeLists(ctx: BootstrapContextResponse): {
  accessibleScopes: AccessibleScopeRow[];
  tenantOptions: string[];
  projectOptions: string[];
} {
  const scopes = (ctx.accessible_scopes || []).map((s) => ({
    tenant_id: String(s.tenant_id || "").trim(),
    project_id: String(s.project_id || "").trim(),
    role: String(s.role || "").trim()
  })) as AccessibleScopeRow[];
  const tenants = Array.from(new Set(scopes.map((s) => s.tenant_id).filter(Boolean)));
  const tenantOptions = tenants.length ? tenants : [String(ctx.effective_scope.tenant_id || "").trim() || "default"];
  const effectiveTenant = String(ctx.effective_scope.tenant_id || "").trim();
  const projectsForTenant = scopes
    .filter((s) => s.tenant_id === effectiveTenant)
    .map((s) => s.project_id)
    .filter(Boolean);
  const projectOptions = Array.from(new Set(projectsForTenant));
  return { accessibleScopes: scopes, tenantOptions, projectOptions };
}

export function AppContextProvider({ children }: PropsWithChildren) {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("maintainer-token");
  const [mappingVersion, setMappingVersion] = useState(1);
  const [bootstrapSource, setBootstrapSource] = useState("client_fallback");
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [accessibleScopes, setAccessibleScopes] = useState<AccessibleScopeRow[]>([]);
  const [tenantOptions, setTenantOptions] = useState<string[]>(["default"]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [isScopeLoading, setIsScopeLoading] = useState(false);
  const bootstrapKeyRef = useRef("");

  const applyBootstrapState = useCallback((ctx: BootstrapContextResponse) => {
    setTenantId(ctx.effective_scope.tenant_id);
    setProjectId(ctx.effective_scope.project_id);
    setMappingVersion(ctx.effective_scope.mapping_version || 1);
    setBootstrapSource(String(ctx.effective_scope.source || "bootstrap"));
    const lists = deriveScopeLists(ctx);
    setAccessibleScopes(lists.accessibleScopes);
    setTenantOptions(lists.tenantOptions);
    setProjectOptions(lists.projectOptions);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Pick<AppContextValue, "tenantId" | "projectId" | "token">>;
      if (typeof parsed.token === "string" && parsed.token.trim()) setToken(parsed.token);
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    const key = `${token}`;
    if (!token.trim()) return;
    if (bootstrapKeyRef.current === key) return;
    bootstrapKeyRef.current = key;
    (async () => {
      try {
        const ctx = await fetchBootstrapContext(token);
        applyBootstrapState(ctx);
        setIsBootstrapped(true);
      } catch {
        setTenantId((prev) => prev || "default");
        setProjectId((prev) => prev || "default_project");
        setMappingVersion((prev) => prev || 1);
        setBootstrapSource("client_fallback");
        setAccessibleScopes([]);
        setTenantOptions((prev) => (prev.length ? prev : ["default"]));
        setProjectOptions([]);
        setIsBootstrapped(true);
      }
    })();
  }, [token, applyBootstrapState]);

  const refreshBootstrap = useCallback(
    async (opts?: { withSpinner?: boolean }) => {
      const t = token.trim();
      if (!t) return;
      const showSpinner = opts?.withSpinner !== false;
      if (showSpinner) setIsScopeLoading(true);
      try {
        const ctx = await fetchBootstrapContext(t);
        applyBootstrapState(ctx);
      } catch {
        // keep prior state on failure
      } finally {
        if (showSpinner) setIsScopeLoading(false);
      }
    },
    [token, applyBootstrapState]
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tenantId, projectId, token, mappingVersion, bootstrapSource })
      );
    } catch {
      // ignore storage write failures
    }
  }, [tenantId, projectId, token, mappingVersion, bootstrapSource]);

  const value = useMemo(
    () => ({
      tenantId,
      projectId,
      token,
      mappingVersion,
      bootstrapSource,
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
    }),
    [
      tenantId,
      projectId,
      token,
      mappingVersion,
      bootstrapSource,
      isBootstrapped,
      accessibleScopes,
      tenantOptions,
      projectOptions,
      isScopeLoading,
      refreshBootstrap
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContextProvider");
  }
  return ctx;
}
