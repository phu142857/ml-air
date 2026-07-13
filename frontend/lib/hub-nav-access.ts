"use client";

import { useMemo } from "react";
import { useAppContext, type AccessibleScopeRow } from "@/lib/app-context";
import { isScopePinned } from "@/lib/scope";

/** Roles that see Execution (pipelines, runs, tasks) in the Hub sidebar. */
const EXECUTION_NAV_ROLES = new Set(["maintainer", "admin"]);

function inferRoleFromToken(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (t.includes("maintainer")) return "maintainer";
  if (t.includes("admin")) return "admin";
  if (t.includes("viewer")) return "viewer";
  return null;
}

function resolveScopeRole(
  tenantId: string,
  projectId: string,
  accessibleScopes: AccessibleScopeRow[],
  token: string,
): string | null {
  const scoped = accessibleScopes.find(
    (s) => s.tenant_id === tenantId && s.project_id === projectId,
  )?.role;
  const fromScope = String(scoped || "").trim().toLowerCase();
  if (fromScope) return fromScope;
  const fromToken = inferRoleFromToken(token);
  if (fromToken) return fromToken;
  return null;
}

export function scopeRoleCanSeeExecutionNav(
  tenantId: string,
  projectId: string,
  accessibleScopes: AccessibleScopeRow[],
  token: string,
): boolean {
  if (!isScopePinned(tenantId, projectId)) {
    return false;
  }
  if (!token.trim()) {
    return false;
  }
  const role = resolveScopeRole(tenantId, projectId, accessibleScopes, token);
  if (!role) {
    return false;
  }
  return EXECUTION_NAV_ROLES.has(role);
}

export function useCanSeeExecutionNav(): boolean {
  const { tenantId, projectId, accessibleScopes, token } = useAppContext();
  return useMemo(
    () => scopeRoleCanSeeExecutionNav(tenantId, projectId, accessibleScopes, token),
    [tenantId, projectId, accessibleScopes, token],
  );
}

export function useCanSeeAdminNav(): boolean {
  const { isGlobalAdmin, hubRole, accessibleScopes } = useAppContext();
  return useMemo(() => {
    if (isGlobalAdmin) return true;
    if (hubRole === "admin") return true;
    return accessibleScopes.some((s) => s.role === "admin");
  }, [isGlobalAdmin, hubRole, accessibleScopes]);
}
