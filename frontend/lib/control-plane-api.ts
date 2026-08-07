import { getApiBaseUrl } from "./api";

const API_BASE = getApiBaseUrl();

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function cpUrl(tenantId: string, projectId: string, path: string): string {
  return `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/control-plane${path}`;
}

async function cpFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(token), ...(init?.headers || {}) }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export type GatewayProvider = {
  provider_id: string;
  provider_type: string;
  name: string;
  base_url: string;
  enabled: boolean;
};

export type GatewayRoute = {
  route_id: string;
  model_pattern: string;
  provider_id: string;
  fallback_provider_id: string | null;
  priority: number;
  enabled: boolean;
};

export type ChargebackReport = {
  tenant_id: string;
  project_id: string;
  period_days: number;
  total_cost_usd: number;
  runs: Array<{ run_id: string; cost_usd: number }>;
  categories: Record<string, number>;
};

export type PromptItem = {
  prompt_id: string;
  name: string;
  tags: string[];
  created_at: string | null;
};

export type PromptVersion = {
  version_id: string;
  version_num: number;
  status: string;
  content: string;
  approved_by?: string | null;
  deployed_at?: string | null;
};

export type AutomlJob = {
  job_id: string;
  pipeline_id: string;
  dataset_id: string | null;
  status: string;
  best_run_id: string | null;
  created_at: string | null;
  trials?: Array<Record<string, unknown>>;
  best_trial?: Record<string, unknown> | null;
};

export async function fetchGatewayProviders(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ items: GatewayProvider[] }>(cpUrl(tenantId, projectId, "/gateway/providers"), token);
}

export async function createGatewayProvider(
  tenantId: string,
  projectId: string,
  token: string,
  body: { provider_type: string; name: string; base_url: string; config?: Record<string, unknown> },
) {
  return cpFetch<GatewayProvider>(cpUrl(tenantId, projectId, "/gateway/providers"), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchGatewayRoutes(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ items: GatewayRoute[] }>(cpUrl(tenantId, projectId, "/gateway/routes"), token);
}

export async function createGatewayRoute(
  tenantId: string,
  projectId: string,
  token: string,
  body: { model_pattern: string; provider_id: string; fallback_provider_id?: string | null; priority?: number },
) {
  return cpFetch<GatewayRoute>(cpUrl(tenantId, projectId, "/gateway/routes"), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function gatewayChat(
  tenantId: string,
  projectId: string,
  token: string,
  body: { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; use_cache?: boolean },
) {
  return cpFetch<Record<string, unknown>>(cpUrl(tenantId, projectId, "/gateway/chat/completions"), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchChargeback(tenantId: string, projectId: string, token: string, days = 30) {
  return cpFetch<ChargebackReport>(`${cpUrl(tenantId, projectId, "/billing/chargeback")}?days=${days}`, token);
}

export async function fetchChargebackSnapshots(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ items: Array<{ period_key: string; payload: ChargebackReport; created_at: string | null }> }>(
    cpUrl(tenantId, projectId, "/billing/snapshots"),
    token,
  );
}

export async function saveChargebackSnapshot(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ period_key: string }>(cpUrl(tenantId, projectId, "/billing/snapshots"), token, { method: "POST" });
}

export async function fetchPrompts(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ items: PromptItem[] }>(cpUrl(tenantId, projectId, "/prompts"), token);
}

export async function createPrompt(tenantId: string, projectId: string, token: string, body: { name: string; tags?: string[] }) {
  return cpFetch<PromptItem>(cpUrl(tenantId, projectId, "/prompts"), token, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchPromptVersions(tenantId: string, projectId: string, promptId: string, token: string) {
  return cpFetch<{ items: PromptVersion[] }>(cpUrl(tenantId, projectId, `/prompts/${promptId}/versions`), token);
}

export async function createPromptVersion(
  tenantId: string,
  projectId: string,
  promptId: string,
  token: string,
  body: { content: string },
) {
  return cpFetch<PromptVersion>(cpUrl(tenantId, projectId, `/prompts/${promptId}/versions`), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function approvePromptVersion(tenantId: string, projectId: string, versionId: string, token: string) {
  return cpFetch<Record<string, unknown>>(cpUrl(tenantId, projectId, `/prompts/versions/${versionId}/approve`), token, {
    method: "POST",
  });
}

export async function deployPromptVersion(tenantId: string, projectId: string, versionId: string, token: string) {
  return cpFetch<Record<string, unknown>>(cpUrl(tenantId, projectId, `/prompts/versions/${versionId}/deploy`), token, {
    method: "POST",
  });
}

export async function copilotSuggest(
  tenantId: string,
  projectId: string,
  token: string,
  body: { action: string; context: Record<string, unknown> },
) {
  return cpFetch<Record<string, unknown>>(cpUrl(tenantId, projectId, "/copilot/suggest"), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchAutomlJobs(tenantId: string, projectId: string, token: string) {
  return cpFetch<{ items: AutomlJob[] }>(cpUrl(tenantId, projectId, "/automl/jobs"), token);
}

export async function createAutomlJob(
  tenantId: string,
  projectId: string,
  token: string,
  body: { pipeline_id: string; dataset_id?: string | null; search_space: Record<string, unknown> },
) {
  return cpFetch<AutomlJob>(cpUrl(tenantId, projectId, "/automl/jobs"), token, { method: "POST", body: JSON.stringify(body) });
}

export async function startAutomlSearch(tenantId: string, projectId: string, jobId: string, token: string) {
  return cpFetch<Record<string, unknown>>(cpUrl(tenantId, projectId, `/automl/jobs/${jobId}/search`), token, { method: "POST" });
}
