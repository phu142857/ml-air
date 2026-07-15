import { getApiBaseUrl } from "./api";

export type AssignmentInput = {
  tenant_id: string;
  role: "maintainer" | "viewer";
  all_projects: boolean;
  project_ids: string[];
};

export type UserSummary = {
  id: string;
  username: string;
  state: string;
  is_global_admin: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserDetail = UserSummary & {
  assignments?: AssignmentRow[];
};

export type AssignmentRow = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  role: string;
  all_projects: boolean;
  project_ids: string[];
  created_at?: string | null;
};

export type ServiceAccountRow = {
  id: string;
  name: string;
  description?: string | null;
  state: string;
  created_at?: string | null;
};

export type SaCredentialRow = {
  token_id: string;
  created_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
};

export type SaScopeRow = {
  id: string;
  service_account_id: string;
  tenant_id: string;
  all_projects: boolean;
  project_ids: string[];
  created_at?: string | null;
};

export type AuditEventRow = {
  id: string;
  occurred_at: string | null;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: string;
  ip?: string | null;
  user_agent?: string | null;
  correlation_id?: string | null;
  payload: Record<string, unknown>;
};

export type IdentityDashboard = {
  total_users: number;
  active_users: number;
  service_accounts: number;
  active_sessions: number;
  recent_events: AuditEventRow[];
};

export type AdminSessionRow = {
  id: string;
  user_id: string;
  username: string;
  created_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  ip: string | null;
  user_agent: string | null;
  is_current?: boolean;
};

export const BUILTIN_ROLES = [
  {
    id: "global_admin",
    name: "Global Admin",
    description: "Full platform access. Bypasses tenant role assignments.",
    permissions: ["platform:*", "identity:admin", "settings:admin"],
  },
  {
    id: "maintainer",
    name: "Maintainer",
    description: "Create and manage ML resources within assigned tenant/project scope.",
    permissions: ["datasets:write", "models:write", "runs:write", "pipelines:write", "tasks:write"],
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access within assigned tenant/project scope.",
    permissions: ["datasets:read", "models:read", "runs:read", "pipelines:read", "tasks:read"],
  },
] as const;

export const SA_PERMISSION_CATALOG = [
  "tasks:lease",
  "tasks:heartbeat",
  "tasks:complete",
  "tasks:fail",
  "logs:write",
  "metrics:write",
  "artifacts:write",
  "usage:write",
] as const;

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body?.error?.message as string) ||
      (typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail || body));
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listUsers(
  token: string,
  opts?: { state?: string; q?: string; limit?: number },
): Promise<UserSummary[]> {
  const qs = new URLSearchParams();
  if (opts?.state?.trim()) qs.set("state", opts.state.trim());
  if (opts?.q?.trim()) qs.set("q", opts.q.trim());
  if (opts?.limit) qs.set("limit", String(opts.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  const body = await adminFetch<{ items: UserSummary[] }>(token, `/users${suffix}`);
  return body.items;
}

export async function createUser(
  token: string,
  payload: { username: string; password: string; state?: string; is_global_admin?: boolean },
): Promise<UserSummary> {
  return adminFetch<UserSummary>(token, "/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getUser(token: string, userId: string): Promise<UserDetail> {
  return adminFetch<UserDetail>(token, `/users/${userId}`);
}

export async function patchUser(
  token: string,
  userId: string,
  payload: { state?: string; password?: string; is_global_admin?: boolean },
): Promise<UserSummary> {
  return adminFetch<UserSummary>(token, `/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(token: string, userId: string): Promise<void> {
  await adminFetch<void>(token, `/users/${userId}`, { method: "DELETE" });
}

export async function listUserAssignments(token: string, userId: string): Promise<AssignmentRow[]> {
  const body = await adminFetch<{ items: AssignmentRow[] }>(token, `/users/${userId}/assignments`);
  return body.items;
}

export async function replaceUserAssignments(
  token: string,
  userId: string,
  assignments: AssignmentInput[],
): Promise<AssignmentRow[]> {
  const body = await adminFetch<{ items: AssignmentRow[] }>(token, `/users/${userId}/assignments`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  });
  return body.items;
}

export async function listServiceAccounts(token: string): Promise<ServiceAccountRow[]> {
  const body = await adminFetch<{ items: ServiceAccountRow[] }>(token, "/service-accounts");
  return body.items;
}

export async function createServiceAccount(
  token: string,
  payload: { name: string; description?: string },
): Promise<ServiceAccountRow> {
  return adminFetch<ServiceAccountRow>(token, "/service-accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getServiceAccount(token: string, saId: string): Promise<ServiceAccountRow> {
  return adminFetch<ServiceAccountRow>(token, `/service-accounts/${saId}`);
}

export async function patchServiceAccount(
  token: string,
  saId: string,
  payload: { name?: string; description?: string; state?: string },
): Promise<ServiceAccountRow> {
  return adminFetch<ServiceAccountRow>(token, `/service-accounts/${saId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function revokeServiceAccount(token: string, saId: string): Promise<void> {
  await adminFetch<void>(token, `/service-accounts/${saId}/revoke`, { method: "POST" });
}

export async function issueServiceAccountSecret(
  token: string,
  saId: string,
): Promise<{ token_id: string; secret: string; created_at: string }> {
  return adminFetch(token, `/service-accounts/${saId}/issue-secret`, { method: "POST" });
}

export async function rotateServiceAccountSecret(
  token: string,
  saId: string,
  revokeTokenId?: string,
): Promise<{ token_id: string; secret: string; created_at: string }> {
  return adminFetch(token, `/service-accounts/${saId}/rotate`, {
    method: "POST",
    body: JSON.stringify(revokeTokenId ? { revoke_token_id: revokeTokenId } : {}),
  });
}

export async function listServiceAccountCredentials(token: string, saId: string): Promise<SaCredentialRow[]> {
  const body = await adminFetch<{ items: SaCredentialRow[] }>(token, `/service-accounts/${saId}/credentials`);
  return body.items;
}

export async function revokeServiceAccountCredential(
  token: string,
  saId: string,
  tokenId: string,
): Promise<void> {
  await adminFetch<void>(token, `/service-accounts/${saId}/credentials/${tokenId}/revoke`, { method: "POST" });
}

export async function getServiceAccountPermissions(token: string, saId: string): Promise<string[]> {
  const body = await adminFetch<{ permissions: string[] }>(token, `/service-accounts/${saId}/permissions`);
  return body.permissions;
}

export async function putServiceAccountPermissions(token: string, saId: string, permissions: string[]): Promise<string[]> {
  const body = await adminFetch<{ permissions: string[] }>(token, `/service-accounts/${saId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
  return body.permissions;
}

export async function listServiceAccountScopes(token: string, saId: string): Promise<SaScopeRow[]> {
  const body = await adminFetch<{ items: SaScopeRow[] }>(token, `/service-accounts/${saId}/scopes`);
  return body.items;
}

export async function addServiceAccountScope(
  token: string,
  saId: string,
  payload: { tenant_id: string; all_projects: boolean; project_ids: string[] },
): Promise<SaScopeRow> {
  return adminFetch<SaScopeRow>(token, `/service-accounts/${saId}/scopes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteServiceAccountScope(token: string, saId: string, scopeId: string): Promise<void> {
  await adminFetch<void>(token, `/service-accounts/${saId}/scopes/${scopeId}`, { method: "DELETE" });
}

export async function listIdentityAudit(
  token: string,
  opts?: { limit?: number; action?: string; q?: string; actorId?: string },
): Promise<AuditEventRow[]> {
  const qs = new URLSearchParams({ limit: String(opts?.limit ?? 100) });
  if (opts?.action?.trim()) qs.set("action", opts.action.trim());
  if (opts?.q?.trim()) qs.set("q", opts.q.trim());
  if (opts?.actorId?.trim()) qs.set("actor_id", opts.actorId.trim());
  const body = await adminFetch<{ items: AuditEventRow[] }>(token, `/audit?${qs}`);
  return body.items;
}

export async function getIdentityAuditEvent(token: string, eventId: string): Promise<AuditEventRow> {
  return adminFetch<AuditEventRow>(token, `/audit/${encodeURIComponent(eventId)}`);
}

export async function fetchIdentityDashboard(token: string): Promise<IdentityDashboard> {
  return adminFetch<IdentityDashboard>(token, "/identity/dashboard");
}

export async function listAdminSessions(
  token: string,
  refreshToken?: string | null,
  limit = 200,
): Promise<AdminSessionRow[]> {
  const body = await adminFetch<{ items: AdminSessionRow[] }>(token, `/identity/sessions?limit=${limit}`, {
    headers: refreshToken?.trim() ? { "X-MLAir-Refresh-Token": refreshToken.trim() } : undefined,
  });
  return body.items;
}

export async function revokeAdminSession(token: string, sessionId: string): Promise<void> {
  await adminFetch<void>(token, `/identity/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function revokeAllAdminSessions(token: string, userId?: string): Promise<void> {
  const qs = userId?.trim() ? `?user_id=${encodeURIComponent(userId.trim())}` : "";
  await adminFetch<void>(token, `/identity/sessions${qs}`, { method: "DELETE" });
}

export async function fetchTenantProjectsForAdmin(
  token: string,
  tenantId: string,
): Promise<Array<{ project_id: string; name?: string }>> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/v1/tenants/${encodeURIComponent(tenantId)}/projects?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: Array<{ project_id: string; name?: string }> };
  return body.items || [];
}

export async function fetchTenantsForAdmin(token: string): Promise<string[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/v1/tenants?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return ["default"];
  const body = (await res.json()) as { items?: Array<{ tenant_id: string }> };
  const ids = (body.items || []).map((t) => String(t.tenant_id || "").trim()).filter(Boolean);
  return ids.length ? ids : ["default"];
}
