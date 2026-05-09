"use client";

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchBootstrapContext } from "@/lib/api";

type AppContextValue = {
  tenantId: string;
  projectId: string;
  token: string;
  mappingVersion: number;
  bootstrapSource: string;
  isBootstrapped: boolean;
  setTenantId: (value: string) => void;
  setProjectId: (value: string) => void;
  setToken: (value: string) => void;
  setMappingVersion: (value: number) => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const STORAGE_KEY = "ml-air:ui-context";

export function AppContextProvider({ children }: PropsWithChildren) {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("maintainer-token");
  const [mappingVersion, setMappingVersion] = useState(1);
  const [bootstrapSource, setBootstrapSource] = useState("client_fallback");
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const bootstrapKeyRef = useRef("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Pick<AppContextValue, "tenantId" | "projectId" | "token">>;
      // Token is the only client-trusted input for bootstrapping; tenant/project must be validated by backend.
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
        setTenantId(ctx.effective_scope.tenant_id);
        setProjectId(ctx.effective_scope.project_id);
        setMappingVersion(ctx.effective_scope.mapping_version || 1);
        setBootstrapSource(String(ctx.effective_scope.source || "bootstrap"));
        setIsBootstrapped(true);
      } catch {
        // Keep a safe default scope if bootstrap fails (e.g. API unavailable).
        setTenantId((prev) => prev || "default");
        setProjectId((prev) => prev || "default_project");
        setMappingVersion((prev) => prev || 1);
        setBootstrapSource("client_fallback");
        setIsBootstrapped(true);
      }
    })();
  }, [token]);

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
      setTenantId,
      setProjectId,
      setToken,
      setMappingVersion
    }),
    [tenantId, projectId, token, mappingVersion, bootstrapSource, isBootstrapped]
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
