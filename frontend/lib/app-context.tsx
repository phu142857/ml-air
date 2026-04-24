"use client";

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

type AppContextValue = {
  tenantId: string;
  projectId: string;
  token: string;
  setTenantId: (value: string) => void;
  setProjectId: (value: string) => void;
  setToken: (value: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const STORAGE_KEY = "ml-air:ui-context";

export function AppContextProvider({ children }: PropsWithChildren) {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("maintainer-token");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Pick<AppContextValue, "tenantId" | "projectId" | "token">>;
      if (typeof parsed.tenantId === "string" && parsed.tenantId.trim()) setTenantId(parsed.tenantId);
      if (typeof parsed.projectId === "string" && parsed.projectId.trim()) setProjectId(parsed.projectId);
      if (typeof parsed.token === "string" && parsed.token.trim()) setToken(parsed.token);
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tenantId, projectId, token }));
    } catch {
      // ignore storage write failures
    }
  }, [tenantId, projectId, token]);

  const value = useMemo(
    () => ({ tenantId, projectId, token, setTenantId, setProjectId, setToken }),
    [tenantId, projectId, token]
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
