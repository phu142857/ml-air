"use client";

import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

type AppContextValue = {
  tenantId: string;
  projectId: string;
  token: string;
  setTenantId: (value: string) => void;
  setProjectId: (value: string) => void;
  setToken: (value: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: PropsWithChildren) {
  const [tenantId, setTenantId] = useState("default");
  const [projectId, setProjectId] = useState("default_project");
  const [token, setToken] = useState("maintainer-token");

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
