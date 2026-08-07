/** Cached accessible scopes from bootstrap — used for aggregate list fan-out. */

export type ScopePair = { tenant_id: string; project_id: string };

let cachedAccessibleScopes: ScopePair[] = [];

export function setAccessibleScopeCache(
  scopes: Array<{ tenant_id: string; project_id: string }>,
): void {
  cachedAccessibleScopes = scopes
    .map((s) => ({
      tenant_id: String(s.tenant_id || "").trim(),
      project_id: String(s.project_id || "").trim(),
    }))
    .filter(
      (s) =>
        Boolean(s.tenant_id) &&
        Boolean(s.project_id) &&
        s.tenant_id !== "*" &&
        s.project_id !== "*",
    );
}

export function getAccessibleScopeCache(): ScopePair[] {
  return [...cachedAccessibleScopes];
}

export function clearAccessibleScopeCache(): void {
  cachedAccessibleScopes = [];
}

/** Resolve tenant/project pairs for aggregate Hub list queries. */
export function resolveScopePairsFromCache(
  tenantId: string,
  projectId: string,
  cached: ScopePair[] = cachedAccessibleScopes,
): ScopePair[] {
  const scopes = cached.length ? cached : [];
  if (!scopes.length) return [];

  if (tenantId === "all" && projectId === "all") {
    return scopes;
  }
  if (tenantId !== "all" && projectId === "all") {
    return scopes.filter((s) => s.tenant_id === tenantId);
  }
  if (tenantId !== "all" && projectId !== "all") {
    const pid = projectId.trim();
    return scopes.filter((s) => s.tenant_id === tenantId && s.project_id === pid);
  }
  return scopes.filter((s) => s.project_id === projectId);
}

export function resolveTenantIdsFromCache(
  tenantId: string,
  cached: ScopePair[] = cachedAccessibleScopes,
): string[] {
  if (tenantId !== "all") return [tenantId];
  return Array.from(new Set(cached.map((s) => s.tenant_id))).sort();
}

export function projectIdsForTenantFromCache(
  tenantId: string,
  cached: ScopePair[] = cachedAccessibleScopes,
): string[] {
  return Array.from(
    new Set(cached.filter((s) => s.tenant_id === tenantId).map((s) => s.project_id)),
  ).sort();
}
