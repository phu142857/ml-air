"use client";

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BootstrapContextResponse } from "@/lib/api";
import { fetchBootstrapContext } from "@/lib/api";
import {
  clearAuthSession,
  loadAuthSession,
  refreshIdentityDeduped,
  saveAuthSession,
} from "@/lib/identity-api";
import {
  DEFAULT_SESSION_ENDED_MESSAGE,
  isAuthSessionFailure,
  stashLogoutReason,
} from "@/lib/auth-session";

export type AccessibleScopeRow = { tenant_id: string; project_id: string; role: string };

type AppContextValue = {
  tenantId: string;
  projectId: string;
  token: string;
  refreshToken: string;
  username: string | null;
  hubRole: string | null;
  isGlobalAdmin: boolean;
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
  setRefreshToken: (value: string) => void;
  setMappingVersion: (value: number) => void;
  /** Re-fetch bootstrap; use `withSpinner: false` when an outer scope transaction already shows loading. */
  refreshBootstrap: (opts?: { withSpinner?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  /** Clear local session and redirect to login (skips logout API when session is already invalid). */
  forceLogout: (message?: string) => Promise<void>;
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
  const tenantsFromScopes = Array.from(new Set(scopes.map((s) => s.tenant_id).filter(Boolean)));
  const effTenant = String(ctx.effective_scope.tenant_id || "").trim();
  const defTenant = String(ctx.defaults?.tenant_id || "").trim();
  const tenantSet = new Set<string>([...tenantsFromScopes, effTenant, defTenant].filter(Boolean));
  const tenantOptions = tenantSet.size ? Array.from(tenantSet).sort() : ["default"];

  const effectiveTenant = effTenant || "default";
  const projectsForTenant = scopes
    .filter((s) => s.tenant_id === effectiveTenant)
    .map((s) => s.project_id)
    .filter(Boolean);
  const projectSet = new Set(projectsForTenant);
  const effProject = String(ctx.effective_scope.project_id || "").trim();
  const defProject = String(ctx.defaults?.project_id || "").trim();
  if (effProject) projectSet.add(effProject);
  if (defProject) projectSet.add(defProject);
  const projectOptions = projectSet.size ? Array.from(projectSet).sort() : ["default_project"];
  return { accessibleScopes: scopes, tenantOptions, projectOptions };
}

export function AppContextProvider({ children }: PropsWithChildren) {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [hubRole, setHubRole] = useState<string | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
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
    const u = (ctx.user as { username?: string; is_global_admin?: boolean; role?: string } | undefined);
    if (u?.username) setUsername(u.username);
    if (u?.role) setHubRole(u.role);
    setIsGlobalAdmin(Boolean(u?.is_global_admin) || u?.role === "admin");
    const lists = deriveScopeLists(ctx);
    setAccessibleScopes(lists.accessibleScopes);
    setTenantOptions(lists.tenantOptions);
    setProjectOptions(lists.projectOptions);
  }, []);

  useEffect(() => {
    const session = loadAuthSession();
    if (!session) return;
    setToken(session.accessToken);
    setRefreshToken(session.refreshToken);
    if (session.username) setUsername(session.username);
  }, []);

  useEffect(() => {
    const key = `${token}`;
    if (!token.trim()) {
      setIsBootstrapped(true);
      return;
    }
    if (bootstrapKeyRef.current === key) return;
    bootstrapKeyRef.current = key;
    (async () => {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 30_000);
      try {
        const ctx = await fetchBootstrapContext(token, { signal: ac.signal });
        applyBootstrapState(ctx);
        setIsBootstrapped(true);
      } catch (err) {
        let authFailure = err instanceof Error && isAuthSessionFailure(err.message);
        if (refreshToken.trim()) {
          try {
            const refreshed = await refreshIdentityDeduped(refreshToken);
            const next = {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              username: username || undefined,
            };
            saveAuthSession(next);
            setToken(refreshed.access_token);
            setRefreshToken(refreshed.refresh_token);
            const ctx = await fetchBootstrapContext(refreshed.access_token, { signal: ac.signal });
            applyBootstrapState(ctx);
            setIsBootstrapped(true);
            return;
          } catch {
            authFailure = true;
          }
        }
        if (authFailure) {
          stashLogoutReason(DEFAULT_SESSION_ENDED_MESSAGE);
          clearAuthSession();
          setToken("");
          setRefreshToken("");
          setUsername(null);
          bootstrapKeyRef.current = "";
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          return;
        }
        setTenantId((prev) => prev || "default");
        setProjectId((prev) => prev || "default_project");
        setMappingVersion((prev) => prev || 1);
        setBootstrapSource("client_fallback");
        setAccessibleScopes([]);
        setTenantOptions((prev) => (prev.length ? prev : ["default"]));
        setProjectOptions((prev) => (prev.length ? prev : ["default_project"]));
        setIsBootstrapped(true);
      } finally {
        clearTimeout(tid);
      }
    })();
  }, [token, refreshToken, username, applyBootstrapState]);

  const refreshBootstrap = useCallback(
    async (opts?: { withSpinner?: boolean }) => {
      const t = token.trim();
      if (!t) return;
      const showSpinner = opts?.withSpinner !== false;
      if (showSpinner) setIsScopeLoading(true);
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 30_000);
      try {
        const ctx = await fetchBootstrapContext(t, { signal: ac.signal });
        applyBootstrapState(ctx);
      } catch {
        // keep prior state on failure
      } finally {
        clearTimeout(tid);
        if (showSpinner) setIsScopeLoading(false);
      }
    },
    [token, applyBootstrapState]
  );

  useEffect(() => {
    try {
      if (!token.trim()) {
        clearAuthSession();
      }
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tenantId,
          projectId,
          token: token.trim() ? token : "",
          mappingVersion,
          bootstrapSource,
        })
      );
      if (token.trim() && refreshToken.trim()) {
        saveAuthSession({
          accessToken: token,
          refreshToken,
          username: username || undefined,
        });
      }
    } catch {
      // ignore storage write failures
    }
  }, [tenantId, projectId, token, refreshToken, username, mappingVersion, bootstrapSource]);

  const forceLogout = useCallback(async (message?: string) => {
    const notice = message?.trim() || DEFAULT_SESSION_ENDED_MESSAGE;
    stashLogoutReason(notice);
    clearAuthSession();
    setToken("");
    setRefreshToken("");
    setUsername(null);
    bootstrapKeyRef.current = "";
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  const logout = useCallback(async () => {
    const { logoutIdentity } = await import("@/lib/identity-api");
    try {
      if (token.trim()) await logoutIdentity(token, refreshToken || undefined);
    } catch {
      // ignore logout API errors
    }
    clearAuthSession();
    setToken("");
    setRefreshToken("");
    setUsername(null);
    bootstrapKeyRef.current = "";
    if (typeof window !== "undefined") window.location.href = "/login";
  }, [token, refreshToken]);

  const value = useMemo(
    () => ({
      tenantId,
      projectId,
      token,
      refreshToken,
      username,
      hubRole,
      isGlobalAdmin,
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
      setRefreshToken,
      setMappingVersion,
      refreshBootstrap,
      logout,
      forceLogout,
    }),
    [
      tenantId,
      projectId,
      token,
      refreshToken,
      username,
      hubRole,
      isGlobalAdmin,
      mappingVersion,
      bootstrapSource,
      isBootstrapped,
      accessibleScopes,
      tenantOptions,
      projectOptions,
      isScopeLoading,
      refreshBootstrap,
      logout,
      forceLogout,
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
