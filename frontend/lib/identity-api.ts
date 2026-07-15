import { getApiBaseUrl } from "./api";

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: {
    id: string;
    username: string;
    is_global_admin: boolean;
    state: string;
  };
};

export type IdentityMeResponse = {
  id: string;
  username: string;
  display_name?: string | null;
  email?: string | null;
  state: string;
  is_global_admin: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
  assignments: Array<{
    id: string;
    tenant_id: string;
    role: string;
    all_projects: boolean;
    project_ids: string[];
  }>;
};

export type IdentitySessionRow = {
  id: string;
  user_id: string;
  created_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
  is_current?: boolean;
};

export type PersonalAccessTokenRow = {
  id: string;
  user_id: string;
  description: string;
  created_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type PersonalAccessTokenCreated = PersonalAccessTokenRow & {
  token: string;
};

const AUTH_STORAGE_KEY = "ml-air:auth-session";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  username?: string;
};

export function loadAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken?.trim() || !parsed.refreshToken?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function identityFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

export async function loginIdentity(username: string, password: string): Promise<LoginResponse> {
  return identityFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function refreshIdentity(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  return identityFetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function logoutIdentity(accessToken: string, refreshToken?: string): Promise<void> {
  await identityFetch("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });
}

export async function fetchIdentityMe(accessToken: string): Promise<IdentityMeResponse> {
  return identityFetch<IdentityMeResponse>("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function patchIdentityMe(
  accessToken: string,
  body: { display_name?: string | null; email?: string | null },
): Promise<IdentityMeResponse> {
  return identityFetch<IdentityMeResponse>("/auth/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}

export async function changeIdentityPassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await identityFetch("/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function fetchIdentitySessions(
  accessToken: string,
  refreshToken?: string,
): Promise<IdentitySessionRow[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (refreshToken?.trim()) {
    headers["X-MLAir-Refresh-Token"] = refreshToken.trim();
  }
  const body = await identityFetch<{ items: IdentitySessionRow[] }>("/auth/sessions", { headers });
  return body.items;
}

export async function revokeIdentitySession(accessToken: string, sessionId: string): Promise<void> {
  await identityFetch(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchPersonalAccessTokens(accessToken: string): Promise<PersonalAccessTokenRow[]> {
  const body = await identityFetch<{ items: PersonalAccessTokenRow[] }>("/auth/pats", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return body.items;
}

export async function createPersonalAccessToken(
  accessToken: string,
  description: string,
  expiresInDays?: number | null,
): Promise<PersonalAccessTokenCreated> {
  return identityFetch<PersonalAccessTokenCreated>("/auth/pats", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      description,
      expires_in_days: expiresInDays ?? null,
    }),
  });
}

export async function revokePersonalAccessToken(accessToken: string, patId: string): Promise<void> {
  await identityFetch(`/auth/pats/${encodeURIComponent(patId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
