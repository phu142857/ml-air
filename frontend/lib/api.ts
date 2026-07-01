import { buildAuditTimelineSearchParams, type AuditTimelineFilters } from "./audit-timeline-filters";
import { resolveRealtimeWsBase } from "./realtime-url";

type RuntimeConfigGlobal = {
  __ML_AIR_RUNTIME_CONFIG__?: {
    api_base_url?: string | null;
    realtime_base_url?: string | null;
    environment?: string;
    features?: Record<string, boolean>;
    observability?: RuntimeConfigObservability;
  } | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Browser-reachable API base when an absolute URL is required (Settings preview, legacy paths).
 * Production browsers use same-origin; server/build uses internal URL — never hardcode localhost in prod browser.
 */
export function getPublicApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return stripTrailingSlash(window.location.origin);
  }
  const fromEnv = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (fromEnv && fromEnv !== "/") {
    return stripTrailingSlash(fromEnv);
  }
  return stripTrailingSlash(
    process.env.MLAIR_NEXT_INTERNAL_API_URL || process.env.ML_AIR_API_BASE_URL || "http://api:8080",
  );
}

/** Fallback when runtime-config omits api_base_url (browser: same-origin; SSR: public/internal env). */
export function runtimeConfigApiBaseFallback(): string {
  if (typeof window !== "undefined") {
    return stripTrailingSlash(window.location.origin);
  }
  return getPublicApiBaseUrl();
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const g = window as unknown as RuntimeConfigGlobal;
    const raw = String(g.__ML_AIR_RUNTIME_CONFIG__?.api_base_url || "").trim();
    if (raw) return raw;
    // Same-origin ``/v1/*`` via Next proxy (``app/v1/[[...segments]]/route.ts``) — avoids browser↔API CORS.
    if (process.env.NODE_ENV !== "test") {
      return "";
    }
  }
  return stripTrailingSlash(
    process.env.MLAIR_NEXT_INTERNAL_API_URL ||
      process.env.ML_AIR_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "http://localhost:8080"
  );
}

/** WebSocket root: runtime inject → build env → sensible default (see `realtime-url.ts`). */
export function getRealtimeWsBase(): string {
  if (typeof window !== "undefined") {
    const g = window as unknown as RuntimeConfigGlobal;
    return resolveRealtimeWsBase(
      g.__ML_AIR_RUNTIME_CONFIG__?.realtime_base_url,
      process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS,
    );
  }
  return resolveRealtimeWsBase(null, process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS);
}

// Important: keep `API_BASE` usable in template strings without refactoring call sites.
// `${API_BASE}` will coerce to string at runtime and call `toString()`, which reads the latest runtime config.
export const API_BASE: string = ({
  toString: () => getApiBaseUrl(),
  valueOf: () => getApiBaseUrl()
} as unknown) as string;

export type RunItem = {
  run_id: string;
  tenant_id: string;
  project_id: string;
  pipeline_id: string;
  status: string;
  idempotency_key?: string | null;
  priority?: string;
  max_parallel_tasks?: number;
  updated_at?: string;
  created_at?: string;
  config_snapshot?: Record<string, unknown> | null;
  training_mode?: string;
  override_config?: Record<string, unknown> | null;
  environment?: RunEnvironment | null;
};

export type RunEnvironment = {
  captured_at?: string;
  capturer?: string;
  python_version?: string;
  python_implementation?: string;
  platform?: string;
  hostname?: string;
  machine?: string;
  processor?: string;
  cpu_count?: number;
  memory_total_mb?: number;
  timezone?: string;
  runtime_kind?: string;
  ml_air_environment?: string;
  service_name?: string;
  cuda_version?: string;
  gpu_name?: string;
  docker_image?: string;
  python_packages_digest?: string;
  random_seed?: string;
  git?: {
    commit?: string | null;
    branch?: string | null;
    dirty?: boolean | null;
    root?: string | null;
    source?: string | null;
  };
};

export type TaskItem = {
  task_id: string;
  status: string;
  attempt: number;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  cpu_time_seconds?: number | null;
  memory_rss_kb?: number | null;
};

export type LogItemPayload = {
  task_id?: string;
  plugin?: string;
  worker_id?: string;
  [key: string]: unknown;
};

export type LogItem = {
  ts: string;
  level: string;
  message: string;
  trace_id?: string;
  payload?: LogItemPayload;
};

export type PipelineItem = {
  pipeline_id: string;
  latest_run_id: string;
  latest_status: string;
  updated_at: string;
  total_runs: number;
};

export type PipelineVersionItem = {
  version_id: string;
  version: number;
  config: Record<string, unknown>;
  created_at: string;
};

export type RunTracking = {
  run_id: string;
  params: Array<{ key: string; value: string; logged_at: string }>;
  metrics: Array<{ key: string; value: number; step: number; logged_at: string }>;
  artifacts: Array<{ artifact_id: string; path: string; uri?: string | null; logged_at: string }>;
};

export type UsageSampleStats = {
  cpu_pct_avg?: number | null;
  cpu_pct_peak?: number | null;
  memory_mb_avg?: number | null;
  memory_mb_peak?: number | null;
  gpu_util_pct_avg?: number | null;
  gpu_util_pct_peak?: number | null;
  gpu_memory_mb_avg?: number | null;
  gpu_memory_mb_peak?: number | null;
};

export type UsageSummaryRecord = {
  runtime_seconds?: number | null;
  cpu_seconds?: number | null;
  memory_rss_peak_kb?: number | null;
  memory_mb_seconds?: number | null;
  gpu_seconds?: number | null;
  gpu_memory_mb_seconds?: number | null;
  disk_read_bytes?: number | null;
  disk_write_bytes?: number | null;
  task_count?: number | null;
} & UsageSampleStats;

export type RunUsageRollupItem = {
  run_id: string;
  runtime_seconds?: number | null;
  cpu_seconds?: number | null;
  gpu_seconds?: number | null;
  task_count?: number | null;
  aggregated_at?: string | null;
};

export type ProjectUsageRollupItem = {
  project_id: string;
  run_count: number;
  usage: UsageSummaryRecord | null;
};

export type ProjectUsageBundle = {
  tenant_id: string;
  project_id: string;
  days: number | null;
  run_count: number;
  usage: UsageSummaryRecord | null;
  runs: RunUsageRollupItem[];
  enabled: boolean;
};

export type TenantUsageBundle = {
  tenant_id: string;
  days: number | null;
  run_count: number;
  usage: UsageSummaryRecord | null;
  projects: ProjectUsageRollupItem[];
  enabled: boolean;
};

export type RunUsageRecord = {
  run_id: string;
  tenant_id: string;
  project_id: string;
  runtime_seconds?: number | null;
  cpu_seconds?: number | null;
  memory_rss_peak_kb?: number | null;
  memory_mb_seconds?: number | null;
  gpu_seconds?: number | null;
  gpu_memory_mb_seconds?: number | null;
  disk_read_bytes?: number | null;
  disk_write_bytes?: number | null;
  task_count?: number | null;
  aggregated_at?: string | null;
} & UsageSampleStats;

export type TaskUsageRecord = {
  task_id: string;
  run_id?: string | null;
  plugin?: string | null;
  runtime_seconds?: number | null;
  cpu_seconds?: number | null;
  memory_rss_peak_kb?: number | null;
  memory_mb_seconds?: number | null;
  gpu_seconds?: number | null;
  gpu_memory_mb_seconds?: number | null;
  disk_read_bytes?: number | null;
  disk_write_bytes?: number | null;
  sample_count?: number | null;
} & UsageSampleStats;

export type TaskLiveUsage = {
  task_id: string;
  runtime_seconds?: number | null;
  cpu_percent?: number | null;
  memory_mb?: number | null;
  gpu_util_percent?: number | null;
  gpu_memory_mb?: number | null;
  cpu_pct_peak?: number | null;
  memory_mb_peak?: number | null;
  gpu_util_pct_peak?: number | null;
  gpu_memory_mb_peak?: number | null;
  sample_count?: number | null;
};

export type RunUsageBundle = {
  run_id: string;
  usage: RunUsageRecord | null;
  tasks: TaskUsageRecord[];
  live?: TaskLiveUsage[];
  enabled: boolean;
};

export type UsageSamplePoint = {
  id: number;
  task_id: string;
  sampled_at: string;
  cpu_percent?: number | null;
  memory_mb?: number | null;
  gpu_util_percent?: number | null;
  gpu_memory_mb?: number | null;
};

export type RunUsageSamplesBundle = {
  run_id: string;
  task_id?: string | null;
  enabled: boolean;
  samples: UsageSamplePoint[];
  next_cursor?: string | null;
  count: number;
};

export type TaskUsageBundle = {
  task_id: string;
  usage: TaskUsageRecord | null;
  enabled: boolean;
};

export type PluginCompatibility = {
  compatible: boolean;
  reasons: Array<{ code: string; message: string }>;
  mlair_engine_version?: string;
  engine_supported_range?: string | null;
  plugin_version_range?: string | null;
  version_constraint?: string | null;
};

export type PluginItem = {
  name: string;
  version: string;
  engine_version: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  ui_schema?: Record<string, unknown> | null;
  enabled: boolean;
  compatibility?: PluginCompatibility;
};

export type ModelItem = {
  model_id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  production_version?: number | null;
};

export type DatasetItem = {
  dataset_id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  source_uri?: string | null;
  current_size?: number;
  checksum?: string | null;
};

type ProjectsResponse = {
  items: Array<{ project_id: string }>;
};
type TenantsResponse = {
  items: Array<{ tenant_id: string }>;
};

export type WhoAmIResponse = {
  role: string;
  tenant_id?: string;
  project_ids?: string[];
};

export type SemanticObservabilityMetricRef = {
  name: string;
  kind: string;
  labels: string[];
};

export type SemanticObservabilitySurface = {
  id?: string;
  title?: string;
  description?: string;
  metrics?: SemanticObservabilityMetricRef[];
  event_types?: string[];
  grafana_dashboards?: string[];
};

export type RuntimeConfigObservability = {
  jaeger_ui_url?: string | null;
  grafana_ui_url?: string | null;
  semantic_observability_surfaces?: SemanticObservabilitySurface[];
};

export type RuntimeConfigResponse = {
  environment: string;
  api_base_url?: string | null;
  realtime_base_url?: string | null;
  hub_default_route?: string | null;
  default_tenant_hint?: string | null;
  default_project_hint?: string | null;
  features?: Record<string, boolean>;
  observability?: RuntimeConfigObservability;
  build?: { frontend_version?: string | null; frontend_commit?: string | null };
};

export type BootstrapContextResponse = {
  user: { subject: string; role: string; tenant_id?: string | null };
  effective_scope: {
    tenant_id: string;
    project_id: string;
    source: string;
    mapping_version: number;
  };
  defaults: { tenant_id: string; project_id: string };
  accessible_scopes: Array<{ tenant_id: string; project_id: string; role: string }>;
  feature_flags?: Record<string, boolean>;
};

export type ScopeDecisionResponse = {
  decision: "allow" | "deny";
  reason_code: string;
  subject: string;
  tenant_id: string;
  project_id: string;
  mapping_version: number;
  sources_checked: string[];
};

export type ScopeContextInspectResponse = {
  subject: string;
  scope_override: {
    subject: string;
    tenant_id: string;
    project_id: string;
    mapping_version: number;
    updated_at?: string | null;
  } | null;
  override_active: boolean;
};

export function normalizeProjectId(projectId: string): string {
  const raw = String(projectId || "").trim().toLowerCase();
  if (raw === "global") return "default_project";
  return String(projectId || "").trim();
}

export type ModelApprovalStatus = "pending_manual_approval" | "approved" | "rejected";

export type ModelVersionItem = {
  version_id: string;
  model_id: string;
  version: number;
  run_id?: string | null;
  artifact_uri?: string | null;
  stage: string;
  created_at: string;
  approval_status?: ModelApprovalStatus | string;
  approval_reason?: string | null;
  approval_updated_at?: string | null;
};

export type ModelServingSlotEntry = {
  slot: string;
  version_id: string;
  version: number;
  artifact_uri?: string | null;
  stage?: string;
  approval_status?: string;
};

export type ModelServingMatrix = {
  model_id: string;
  slots: Record<string, ModelServingSlotEntry>;
};

export type ReadinessItem = {
  dataset_id?: string | null;
  dataset: string;
  role: string;
  actual_size: number;
  required_size: number;
  status: string;
};

export type RunReadiness = {
  run_id: string;
  tenant_id: string;
  project_id: string;
  training_mode: string;
  ready: boolean;
  details: ReadinessItem[];
  blocking_datasets: ReadinessItem[];
  override_applied?: boolean;
};

function authHeaders(token: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchProjectsForTenant(tenantId: string, token: string): Promise<string[]> {
  if (tenantId === "all") {
    const tenants = await fetchTenants(token);
    const responses = await Promise.all(
      tenants.map(async (tid) => {
        const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects?limit=500`, {
          headers: authHeaders(token),
          cache: "no-store"
        });
        if (!res.ok) return { items: [] as Array<{ project_id: string }> };
        return (await res.json()) as ProjectsResponse;
      })
    );
    const ids = responses
      .flatMap((x) => x.items || [])
      .map((x) => normalizeProjectId(String(x.project_id || "").trim()))
      .filter((x) => {
        const key = String(x || "").trim().toLowerCase();
        return Boolean(key) && key !== "all" && key !== "global";
      });
    return Array.from(new Set(ids.map((x) => String(x).trim())));
  }
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects?limit=500`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await res.json()) as ProjectsResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  const ids = (data.items || [])
    .map((x) => normalizeProjectId(String(x.project_id || "").trim()))
    .filter((x) => {
      const key = String(x || "").trim().toLowerCase();
      return Boolean(key) && key !== "all" && key !== "global";
    });
  return Array.from(new Set(ids.map((x) => String(x).trim())));
}

export async function fetchWhoAmI(token: string): Promise<WhoAmIResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/whoami`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await res.json()) as WhoAmIResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function fetchRuntimeConfig(opts?: { preferRelative?: boolean }): Promise<RuntimeConfigResponse> {
  async function readOk(res: Response): Promise<RuntimeConfigResponse> {
    const data = (await res.json()) as RuntimeConfigResponse;
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
  }

  const browserPreferRelative =
    Boolean(opts?.preferRelative) && typeof window !== "undefined" && process.env.NODE_ENV !== "test";

  if (browserPreferRelative) {
    const rel = await fetch("/v1/runtime-config", { cache: "no-store" });
    if (!rel.ok) {
      let detail = "";
      try {
        const j = (await rel.json()) as { message?: string; hint?: string; error?: string };
        detail = [j.error, j.message, j.hint].filter(Boolean).join(" — ") || JSON.stringify(j);
      } catch {
        try {
          detail = (await rel.text()).slice(0, 500);
        } catch {
          /* ignore */
        }
      }
      throw new Error(
        `runtime-config HTTP ${rel.status}${detail ? `: ${detail}` : ""}. ` +
          "The UI uses same-origin /v1; fix the Next.js→API proxy (MLAIR_NEXT_INTERNAL_API_URL, docker compose) — do not rely on the browser calling :8080 directly."
      );
    }
    const out = await readOk(rel);
    const patched = { ...out };
    // Leave empty when same-origin proxy is used; Settings can still read inferred URL from response object.
    if (!String(patched.api_base_url || "").trim() && typeof window === "undefined") {
      patched.api_base_url = runtimeConfigApiBaseFallback();
    }
    if (!String(patched.realtime_base_url || "").trim()) {
      patched.realtime_base_url = resolveRealtimeWsBase(null, process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS);
    }
    return patched;
  }

  const base =
    typeof window !== "undefined"
      ? stripTrailingSlash(String(getApiBaseUrl() || runtimeConfigApiBaseFallback()))
      : stripTrailingSlash(getApiBaseUrl());
  const res = await fetch(`${base}/v1/runtime-config`, { cache: "no-store" });
  const out = await readOk(res);
  const patched = { ...out };
  if (typeof window === "undefined" && !String(patched.api_base_url || "").trim()) {
    patched.api_base_url = runtimeConfigApiBaseFallback();
  }
  if (!String(patched.realtime_base_url || "").trim()) {
    patched.realtime_base_url = resolveRealtimeWsBase(null, process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS);
  }
  return patched;
}

export async function fetchBootstrapContext(
  token: string,
  opts?: { signal?: AbortSignal }
): Promise<BootstrapContextResponse> {
  const res = await fetch(`${API_BASE}/v1/bootstrap/context`, {
    headers: authHeaders(token),
    cache: "no-store",
    signal: opts?.signal
  });
  const data = (await res.json()) as BootstrapContextResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export type TenantQuotas = {
  tenant_id: string;
  max_projects: number | null;
  max_datasets_per_project: number | null;
  max_models_per_project: number | null;
  max_runs_per_project: number | null;
  max_webhook_subscriptions_per_project: number | null;
  webhook_allowed_hosts: string[] | null;
  updated_at?: string | null;
};

export type TenantQuotaUsageResponse = {
  limits: TenantQuotas;
  usage: Record<string, number | string>;
  enforcement_enabled: boolean;
};

export async function fetchTenantQuotas(tenantId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/quotas`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TenantQuotas;
}

export async function fetchTenantQuotaUsage(tenantId: string, token: string, projectId?: string) {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/quotas/usage${qs}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TenantQuotaUsageResponse;
}

export async function upsertTenantQuotas(
  tenantId: string,
  token: string,
  payload: Omit<TenantQuotas, "tenant_id" | "updated_at">
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/quotas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TenantQuotas;
}

export async function switchScopeContext(
  token: string,
  payload: { tenant_id: string; project_id: string; expected_mapping_version?: number }
): Promise<{ ok: boolean; effective_scope: BootstrapContextResponse["effective_scope"] }> {
  const res = await fetch(`${API_BASE}/v1/auth/context/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as { ok: boolean; effective_scope: BootstrapContextResponse["effective_scope"] };
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function clearScopeContext(token: string): Promise<{ ok: boolean; cleared: boolean }> {
  const res = await fetch(`${API_BASE}/v1/auth/context/switch`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  const data = (await res.json()) as { ok: boolean; cleared: boolean };
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function fetchScopeDecision(
  token: string,
  tenantId: string,
  projectId: string
): Promise<ScopeDecisionResponse> {
  const q = new URLSearchParams({ tenant_id: tenantId, project_id: projectId });
  const res = await fetch(`${API_BASE}/v1/auth/scope-decision?${q.toString()}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await res.json()) as ScopeDecisionResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function fetchScopeContextBySubject(
  token: string,
  subject: string
): Promise<ScopeContextInspectResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/scope-context/${encodeURIComponent(subject)}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await res.json()) as ScopeContextInspectResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function fetchTenants(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/v1/tenants?limit=500`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await res.json()) as TenantsResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  const ids = (data.items || [])
    .map((x) => String(x.tenant_id || "").trim())
    .filter(Boolean)
    .filter((x) => String(x).toLowerCase() !== "all");
  return Array.from(new Set(ids));
}

export async function fetchTenantProjects(tenantId: string, token: string): Promise<string[]> {
  return fetchProjectsForTenant(tenantId, token);
}

async function resolveTenantIds(tenantId: string, token: string): Promise<string[]> {
  return tenantId === "all" ? fetchTenants(token) : [tenantId];
}

type ScopePair = { tenant_id: string; project_id: string };

async function resolveScopePairs(tenantId: string, projectId: string, token: string): Promise<ScopePair[]> {
  const tenantIds = await resolveTenantIds(tenantId, token);
  const pairs: ScopePair[] = [];
  for (const tid of tenantIds) {
    const projectIds =
      projectId === "all" ? await fetchProjectsForTenant(tid, token) : [normalizeProjectId(projectId)];
    for (const pid of projectIds) {
      if (pid) pairs.push({ tenant_id: tid, project_id: pid });
    }
  }
  return pairs;
}

export async function fetchRunsPage(
  tenantId: string,
  projectId: string,
  token: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<CursorPage<RunItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const sp = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (opts.cursor) {
    sp.set("cursor", opts.cursor);
  }
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs?${sp.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as RunItem[],
    limit: Number(data.limit) || 50,
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchRuns(tenantId: string, projectId: string, token: string) {
  const tenantIds = await resolveTenantIds(tenantId, token);
  if (projectId === "all") {
    const responses = await Promise.all(
      tenantIds.flatMap((tid) =>
        [fetchProjectsForTenant(tid, token)].flatMap(async (projectsPromise) => {
          const projectIds = await projectsPromise;
          return Promise.all(
            projectIds.map(async (pid) => {
              const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${pid}/runs?limit=50`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: "no-store"
              });
              if (!res.ok) return { items: [] as RunItem[] };
              return (await res.json()) as { items: RunItem[] };
            })
          );
        })
      )
    ).then((x) => x.flat());
    const merged = responses.flatMap((x) => x.items || []);
    merged.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return { items: merged };
  }
  if (tenantIds.length === 1 && tenantId !== "all") {
    const page = await fetchRunsPage(tenantId, projectId, token, { limit: 50 });
    return { items: page.items };
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const responses = await Promise.all(
    tenantIds.map(async (tid) => {
      const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${scopedProjectId}/runs?limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store"
      });
      if (!res.ok) return { items: [] as RunItem[] };
      return (await res.json()) as { items: RunItem[] };
    })
  );
  const merged = responses.flatMap((x) => x.items || []);
  merged.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return { items: merged };
}

export type AuditTimelineItem = {
  ts: string | null;
  kind: string;
  resource_type: string;
  resource_id: string;
  source: string | null;
  payload: Record<string, unknown>;
};

async function fetchAuditTimelineForScope(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; filters?: AuditTimelineFilters; cursor?: string | null }
): Promise<{ items: AuditTimelineItem[]; traceparent: string | null; has_more?: boolean; next_cursor?: string | null }> {
  const scopedProjectId = normalizeProjectId(projectId);
  const lim = Math.min(200, Math.max(1, opts?.limit ?? 25));
  const filters = opts?.filters ?? {};
  const qs = buildAuditTimelineSearchParams(filters, lim, { cursor: opts?.cursor });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/audit/timeline?${qs}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store"
    }
  );
  const traceparent = res.headers.get("traceparent");
  if (!res.ok) return { items: [], traceparent };
  const data = (await res.json()) as {
    items?: unknown;
    has_more?: boolean;
    next_cursor?: string | null;
  };
  const rawItems = data.items;
  const items = Array.isArray(rawItems) ? (rawItems as AuditTimelineItem[]) : [];
  return {
    items,
    traceparent,
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchAuditTimelinePage(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; filters?: AuditTimelineFilters; cursor?: string | null }
): Promise<CursorPage<AuditTimelineItem> & { traceparent: string | null }> {
  const page = await fetchAuditTimelineForScope(tenantId, projectId, token, opts);
  return {
    items: page.items,
    limit: opts?.limit ?? 25,
    has_more: Boolean(page.has_more),
    next_cursor: page.next_cursor ?? null,
    traceparent: page.traceparent,
  };
}

/** Unified audit-ish timeline (readiness evals, model events, run/task snapshots). */
export async function fetchAuditTimeline(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; filters?: AuditTimelineFilters }
): Promise<{ items: AuditTimelineItem[]; traceparent: string | null }> {
  const lim = Math.min(200, Math.max(1, opts?.limit ?? 25));
  if (tenantId === "all" || projectId === "all") {
    const pairs = await resolveScopePairs(tenantId, projectId, token);
    const maxScopes = 12;
    const batch = pairs.slice(0, maxScopes);
    const perScope = Math.max(3, Math.ceil(lim / Math.max(batch.length, 1)));
    const results = await Promise.all(
      batch.map((p) =>
        fetchAuditTimelineForScope(p.tenant_id, p.project_id, token, { ...opts, limit: perScope })
      )
    );
    const items = results
      .flatMap((r) => r.items)
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      .slice(0, lim);
    const traceparent = results.map((r) => r.traceparent).find(Boolean) ?? null;
    return { items, traceparent };
  }
  return fetchAuditTimelineForScope(tenantId, projectId, token, opts);
}

async function exportAuditTimelineForScope(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { format?: "jsonl" | "json"; limit?: number; filters?: AuditTimelineFilters }
): Promise<{ blob: Blob; filename: string }> {
  const scopedProjectId = normalizeProjectId(projectId);
  const lim = Math.min(5000, Math.max(1, opts?.limit ?? 1000));
  const format = opts?.format ?? "jsonl";
  const filters = opts?.filters ?? {};
  const qs = buildAuditTimelineSearchParams(filters, lim);
  const p = new URLSearchParams(qs);
  p.set("format", format);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/audit/timeline/export?${p.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";\n]+)"?/i.exec(cd);
  const ext = format === "json" ? "json" : "jsonl";
  const filename =
    match?.[1]?.trim() || `mlair-audit-timeline-${tenantId}-${scopedProjectId}.${ext}`;
  return { blob, filename };
}

export async function exportAuditTimeline(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { format?: "jsonl" | "json"; limit?: number; filters?: AuditTimelineFilters }
): Promise<{ blob: Blob; filename: string }> {
  const format = opts?.format ?? "jsonl";
  const lim = Math.min(5000, Math.max(1, opts?.limit ?? 1000));

  if (tenantId === "all" || projectId === "all") {
    const pairs = await resolveScopePairs(tenantId, projectId, token);
    const maxScopes = 12;
    const batch = pairs.slice(0, maxScopes);
    const perScope = Math.max(50, Math.ceil(lim / Math.max(batch.length, 1)));
    const lines: string[] = [];
    for (const p of batch) {
      try {
        const { blob } = await exportAuditTimelineForScope(p.tenant_id, p.project_id, token, {
          ...opts,
          format: "jsonl",
          limit: perScope,
        });
        const text = await blob.text();
        for (const line of text.split("\n")) {
          const row = line.trim();
          if (row) lines.push(row);
        }
      } catch {
        /* skip failed scope */
      }
    }
    const body = lines.slice(0, lim).join("\n") + (lines.length ? "\n" : "");
    const ext = format === "json" ? "json" : "jsonl";
    const blob = new Blob([body], { type: format === "json" ? "application/json" : "application/x-ndjson" });
    return { blob, filename: `mlair-audit-aggregate.${ext}` };
  }

  return exportAuditTimelineForScope(tenantId, projectId, token, opts);
}

export async function triggerRun(
  tenantId: string,
  projectId: string,
  token: string,
  payload: {
    pipeline_id: string;
    idempotency_key?: string | null;
    priority: string;
    max_parallel_tasks: number;
    training_mode?: string;
    use_latest_pipeline_version?: boolean;
    dataset_version_id?: string;
    context?: Record<string, unknown>;
    override_config?: Record<string, unknown>;
  }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem;
}

export type SemanticEventEnvelope = {
  version?: string;
  event_id?: string;
  type?: string;
  tenant_id?: string;
  project_id?: string;
  resource_id?: string | null;
  timestamp?: number;
  sequence?: number;
  trace_id?: string | null;
  payload?: Record<string, unknown>;
};

export type ExecutionProjection = {
  version?: number;
  updated_at?: string;
  runs?: Record<
    string,
    {
      run_id: string;
      status: string;
      pipeline_id?: string;
      updated_at?: string;
      sequence?: number;
    }
  >;
  pipelines?: Record<
    string,
    {
      pipeline_id: string;
      latest_run_id?: string;
      latest_status?: string;
      updated_at?: string;
    }
  >;
};

export async function fetchExecutionProjection(
  tenantId: string,
  projectId: string,
  token: string,
): Promise<ExecutionProjection> {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/execution-projection`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ExecutionProjection;
}

export async function fetchSemanticEventReplay(
  tenantId: string,
  projectId: string,
  token: string,
  afterSequence: number,
  limit = 200,
): Promise<{ items: SemanticEventEnvelope[]; last_sequence: number }> {
  const scopedProjectId = normalizeProjectId(projectId);
  const q = new URLSearchParams({
    after_sequence: String(Math.max(0, afterSequence)),
    limit: String(Math.min(500, Math.max(1, limit))),
  });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/semantic-events/replay?${q}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: SemanticEventEnvelope[]; last_sequence: number };
}

export async function fetchRun(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem;
}

export async function fetchRunReadiness(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/readiness`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunReadiness;
}

export async function fetchRunTasks(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/tasks`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: TaskItem[] };
}

export async function fetchRunLogsPage(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<LogItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const limit = opts?.limit ?? 200;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/logs?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const items = ((data.items ?? []) as Array<LogItem & { index?: number }>).map(({ index: _index, ...log }) => log);
  return {
    items,
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchRunLogs(tenantId: string, projectId: string, runId: string, token: string) {
  const page = await fetchRunLogsPage(tenantId, projectId, runId, token, { limit: 200 });
  return { items: page.items };
}

export async function fetchTaskLogsPage(
  tenantId: string,
  projectId: string,
  taskId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<LogItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const limit = opts?.limit ?? 200;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/tasks/${encodeURIComponent(taskId)}/logs?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const items = ((data.items ?? []) as Array<LogItem & { index?: number }>).map(({ index: _index, ...log }) => log);
  return {
    items,
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchTaskLogs(
  tenantId: string,
  projectId: string,
  taskId: string,
  token: string
) {
  const page = await fetchTaskLogsPage(tenantId, projectId, taskId, token, { limit: 200 });
  return { items: page.items };
}

export async function replayDlq(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/dlq/replay`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { run_id: string; replayed: number };
}

export async function cancelRun(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem;
}

export async function fetchPipelinesPage(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<PipelineItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const limit = opts?.limit ?? 100;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/pipelines?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as PipelineItem[],
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchPipelines(tenantId: string, projectId: string, token: string) {
  const tenantIds = await resolveTenantIds(tenantId, token);
  if (projectId === "all") {
    const responses = await Promise.all(
      tenantIds.flatMap((tid) =>
        [fetchProjectsForTenant(tid, token)].flatMap(async (projectsPromise) => {
          const projectIds = await projectsPromise;
          return Promise.all(
            projectIds.map(async (pid) => {
              const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${pid}/pipelines?limit=100`, {
                headers: authHeaders(token),
                cache: "no-store"
              });
              if (!res.ok) return { items: [] as PipelineItem[] };
              return (await res.json()) as { items: PipelineItem[] };
            })
          );
        })
      )
    ).then((x) => x.flat());
    const merged = responses.flatMap((x) => x.items || []);
    merged.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    return { items: merged };
  }
  if (tenantIds.length === 1 && tenantId !== "all") {
    const page = await fetchPipelinesPage(tenantId, projectId, token, { limit: 100 });
    return { items: page.items };
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const responses = await Promise.all(
    tenantIds.map(async (tid) => {
      const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${scopedProjectId}/pipelines?limit=100`, {
        headers: authHeaders(token),
        cache: "no-store"
      });
      if (!res.ok) return { items: [] as PipelineItem[] };
      return (await res.json()) as { items: PipelineItem[] };
    })
  );
  const merged = responses.flatMap((x) => x.items || []);
  merged.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return { items: merged };
}

export async function fetchPipelineDag(tenantId: string, projectId: string, pipelineId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/pipelines/${pipelineId}/dag`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { pipeline_id: string; run_id?: string; nodes: Array<{ id: string; label: string; status: string }>; edges: Array<{ source: string; target: string }> };
}

/** Static pipeline topology (no latest-run status overlay). */
export async function fetchPipelineTopology(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/pipelines/${encodeURIComponent(pipelineId)}/topology`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as import("./execution-graph-types").PipelineTopology;
}

/** Runtime execution graph for a single run. */
export async function fetchRunExecutionGraph(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${encodeURIComponent(runId)}/execution-graph`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as import("./execution-graph-types").RunExecutionGraph;
}

export async function fetchPipelineVersionsPage(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<PipelineVersionItem>> {
  const limit = opts?.limit ?? 20;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${normalizeProjectId(projectId)}/pipelines/${encodeURIComponent(pipelineId)}/versions?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as PipelineVersionItem[],
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchPipelineVersions(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string
) {
  const page = await fetchPipelineVersionsPage(tenantId, projectId, pipelineId, token, { limit: 20 });
  return { items: page.items };
}

export async function evaluatePipelineInputs(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  payload: {
    training_mode: string;
    override_config?: Record<string, unknown>;
    dataset_version_id?: string;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${normalizeProjectId(projectId)}/pipelines/${encodeURIComponent(pipelineId)}/evaluate-inputs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    pipeline_id: string;
    pipeline_version_id?: string;
    ready: boolean;
    pipeline_input_ready: boolean;
    details: Array<{
      dataset: string;
      actual_size: number;
      required_size: number;
      status: string;
      dataset_version_id?: string;
    }>;
    blocking_datasets: Array<Record<string, unknown>>;
    reasons: Array<{ message?: string; code?: string }>;
  };
}

export async function checkPipelineReadiness(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  payload: {
    training_mode: string;
    override_config?: Record<string, unknown>;
    /** Optional; when set, gate uses dataset_versions.record_count for that snapshot. */
    dataset_version_id?: string;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${normalizeProjectId(projectId)}/pipelines/${encodeURIComponent(pipelineId)}/check-readiness`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunReadiness & { pipeline_id: string };
}

export async function triggerPipelineRunWithGating(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  payload: {
    pipeline_id: string;
    idempotency_key?: string | null;
    priority: string;
    max_parallel_tasks: number;
    training_mode: string;
    pipeline_version_id?: string;
    use_latest_pipeline_version?: boolean;
    override_config?: Record<string, unknown>;
    /** When set, validated server-side and merged into override_config + context (immutable snapshot gate). */
    dataset_version_id?: string;
    /** Passed to MLAir as run plugin_context (e.g. mlair_model_id for post-train registry update). */
    context?: Record<string, unknown>;
  }
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/pipelines/${encodeURIComponent(pipelineId)}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem & { blocked_by_gate?: boolean; readiness?: RunReadiness };
}

export async function fetchTask(tenantId: string, projectId: string, taskId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/tasks/${taskId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TaskItem & { tenant_id: string; project_id: string; pipeline_id: string };
}

export type ResolvedTaskScope = {
  tenant_id: string;
  project_id: string;
  method: "pinned" | "hint" | "run" | "fan-out";
};

export type ResolvedTask = TaskItem & {
  tenant_id: string;
  project_id: string;
  pipeline_id?: string;
  run_id?: string;
  resolved_scope: ResolvedTaskScope;
};

function isPinnedScopePair(tenantId?: string | null, projectId?: string | null): boolean {
  return Boolean(tenantId && projectId && tenantId !== "all" && projectId !== "all");
}

function isTaskNotFoundError(e: unknown): boolean {
  const msg = String((e as Error)?.message || e);
  return (
    msg.includes("404") ||
    msg.includes("task_not_found") ||
    msg.includes("not_found") ||
    msg.includes("Not Found")
  );
}

export type TaskResolveHint = {
  tenantId?: string;
  projectId?: string;
  runId?: string;
};

/** Load a task when header scope may be aggregate; optional URL hints avoid fan-out. */
export async function fetchTaskResolved(
  contextTenantId: string,
  contextProjectId: string,
  taskId: string,
  token: string,
  hint?: TaskResolveHint
): Promise<ResolvedTask> {
  const hintTenant = hint?.tenantId?.trim();
  const hintProject = hint?.projectId?.trim();
  const hintRun = hint?.runId?.trim();

  if (isPinnedScopePair(hintTenant, hintProject)) {
    const data = await fetchTask(hintTenant!, hintProject!, taskId, token);
    return {
      ...data,
      resolved_scope: { tenant_id: hintTenant!, project_id: hintProject!, method: "hint" },
    };
  }

  if (isPinnedScopePair(contextTenantId, contextProjectId)) {
    const data = await fetchTask(contextTenantId, contextProjectId, taskId, token);
    return {
      ...data,
      resolved_scope: {
        tenant_id: contextTenantId,
        project_id: contextProjectId,
        method: "pinned",
      },
    };
  }

  if (hintRun) {
    const runs = await fetchRuns(contextTenantId, contextProjectId, token);
    const run = (runs.items ?? []).find((r) => r.run_id === hintRun);
    if (run && isPinnedScopePair(run.tenant_id, run.project_id)) {
      const data = await fetchTask(run.tenant_id, run.project_id, taskId, token);
      return {
        ...data,
        run_id: hintRun,
        resolved_scope: {
          tenant_id: run.tenant_id,
          project_id: run.project_id,
          method: "run",
        },
      };
    }
  }

  const pairs = await resolveScopePairs(contextTenantId, contextProjectId, token);
  const maxScopes = 12;
  for (const p of pairs.slice(0, maxScopes)) {
    try {
      const data = await fetchTask(p.tenant_id, p.project_id, taskId, token);
      return {
        ...data,
        resolved_scope: {
          tenant_id: p.tenant_id,
          project_id: p.project_id,
          method: "fan-out",
        },
      };
    } catch (e) {
      if (isTaskNotFoundError(e)) continue;
      throw e;
    }
  }

  throw new Error(
    `Task "${taskId}" was not found across aggregate scope (checked up to ${maxScopes} projects). ` +
      `Pin tenant + project in the header, or open from a run/tasks link with ?tenant=&project=.`
  );
}

export async function fetchRunTracking(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/tracking`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunTracking;
}

export async function fetchRunUsage(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/usage`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunUsageBundle;
}

export async function fetchRunUsageSamples(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  opts?: { taskId?: string; limit?: number; cursor?: string },
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const params = new URLSearchParams();
  if (opts?.taskId) params.set("task_id", opts.taskId);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/usage-samples${qs}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunUsageSamplesBundle;
}

export async function fetchTaskUsage(
  tenantId: string,
  projectId: string,
  taskId: string,
  token: string,
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/tasks/${taskId}/usage`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TaskUsageBundle;
}

export async function fetchProjectUsage(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { days?: number; topRuns?: number },
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const params = new URLSearchParams();
  if (opts?.days != null) params.set("days", String(opts.days));
  if (opts?.topRuns != null) params.set("top_runs", String(opts.topRuns));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/usage${qs}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ProjectUsageBundle;
}

export async function fetchTenantUsage(
  tenantId: string,
  token: string,
  opts?: { days?: number },
) {
  const params = new URLSearchParams();
  if (opts?.days != null) params.set("days", String(opts.days));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/usage${qs}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TenantUsageBundle;
}

export async function compareRunMetrics(tenantId: string, projectId: string, runIds: string[], token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ run_ids: runIds })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: Array<{ run_id: string; key: string; value: number; step: number; logged_at: string }> };
}

export async function fetchPlugins(token: string) {
  const res = await fetch(`${API_BASE}/v1/plugins`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: PluginItem[]; errors?: Array<{ entry_point: string; error: string }> };
}

export async function fetchPlugin(pluginName: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/plugins/${encodeURIComponent(pluginName)}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as PluginItem;
}

export async function validatePlugin(pluginName: string, context: Record<string, unknown>, token: string) {
  const res = await fetch(`${API_BASE}/v1/plugins/${encodeURIComponent(pluginName)}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ context })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { plugin: string; valid: boolean };
}

export async function reloadPlugins(token: string) {
  const res = await fetch(`${API_BASE}/v1/plugins/reload`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { loaded: number; errors: Array<{ entry_point: string; error: string }> };
}

export async function togglePlugin(pluginName: string, enabled: boolean, token: string) {
  const res = await fetch(`${API_BASE}/v1/plugins/${encodeURIComponent(pluginName)}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ enabled })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { plugin: string; enabled: boolean };
}

export async function fetchModelsPage(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<ModelItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const limit = opts?.limit ?? 100;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/models?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as ModelItem[],
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchModels(tenantId: string, projectId: string, token: string) {
  const tenantIds = await resolveTenantIds(tenantId, token);
  if (projectId === "all") {
    const responses = await Promise.all(
      tenantIds.flatMap((tid) =>
        [fetchProjectsForTenant(tid, token)].flatMap(async (projectsPromise) => {
          const projectIds = await projectsPromise;
          return Promise.all(
            projectIds.map(async (pid) => {
              const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${pid}/models`, {
                headers: authHeaders(token),
                cache: "no-store"
              });
              if (!res.ok) return { items: [] as ModelItem[] };
              return (await res.json()) as { items: ModelItem[] };
            })
          );
        })
      )
    ).then((x) => x.flat());
    const merged = responses.flatMap((x) => x.items || []);
    merged.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    return { items: merged };
  }
  if (tenantIds.length === 1 && tenantId !== "all") {
    const page = await fetchModelsPage(tenantId, projectId, token, { limit: 100 });
    return { items: page.items };
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const responses = await Promise.all(
    tenantIds.map(async (tid) => {
      const res = await fetch(`${API_BASE}/v1/tenants/${tid}/projects/${scopedProjectId}/models`, {
        headers: authHeaders(token),
        cache: "no-store"
      });
      const data = (await res.json().catch(() => ({}))) as { items?: ModelItem[] } | Record<string, unknown>;
      if (!res.ok) {
        // Do not swallow 403/401 as "no models" — that hides token/scope misconfiguration for clinic projects.
        throw new Error(JSON.stringify(data));
      }
      return data as { items: ModelItem[] };
    })
  );
  const merged = responses.flatMap((x) => x.items || []);
  merged.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return { items: merged };
}

export async function fetchDataset(tenantId: string, projectId: string, datasetId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetItem;
}

export async function fetchDatasetReadiness(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  requiredSize = 1000,
  datasetVersionId?: string,
  policyId?: string
) {
  const scoped = normalizeProjectId(projectId);
  const req = Math.max(1, Math.floor(requiredSize));
  const versionQuery = datasetVersionId ? `&dataset_version_id=${encodeURIComponent(datasetVersionId)}` : "";
  const policyQuery = policyId ? `&policy_id=${encodeURIComponent(policyId)}` : "";
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scoped}/datasets/${encodeURIComponent(datasetId)}/readiness?required_size=${req}${versionQuery}${policyQuery}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    dataset_id: string;
    dataset_name?: string;
    dataset_version_id?: string | null;
    current_size: number;
    required_size: number;
    ready: boolean;
    status?: "eligible" | "blocked" | string;
    eligibility_status?: "eligible" | "blocked" | string;
    eligibility_criteria?: Array<{ code: string; label: string; status: "pass" | "fail" | string }>;
    policy_id?: string | null;
    /** ISO timestamp of this derived snapshot (GET is read-only; no ``evaluation_id``). */
    evaluated_at?: string;
    reasons?: Array<string | Record<string, unknown>>;
  };
}

/** Persist a readiness evaluation row + emit realtime (explicit audit; not for polling). */
export async function postDatasetReadinessEvaluate(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  opts?: { requiredSize?: number; datasetVersionId?: string; policyId?: string; source?: string }
) {
  const scoped = normalizeProjectId(projectId);
  const req = Math.max(1, Math.floor(opts?.requiredSize ?? 1000));
  const versionQuery = opts?.datasetVersionId
    ? `&dataset_version_id=${encodeURIComponent(opts.datasetVersionId)}`
    : "";
  const policyQuery = opts?.policyId ? `&policy_id=${encodeURIComponent(opts.policyId)}` : "";
  const sourceQuery = opts?.source ? `&source=${encodeURIComponent(opts.source)}` : "";
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scoped}/datasets/${encodeURIComponent(datasetId)}/readiness/evaluate?required_size=${req}${versionQuery}${policyQuery}${sourceQuery}`,
    { method: "POST", headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as Awaited<ReturnType<typeof fetchDatasetReadiness>> & {
    evaluation_id: string;
    evaluated_at: string;
  };
}

export async function fetchDatasetsPage(
  tenantId: string,
  projectId: string,
  token: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<CursorPage<DatasetItem>> {
  const scopedProjectId = normalizeProjectId(projectId);
  const sp = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.cursor) {
    sp.set("cursor", opts.cursor);
  }
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/datasets?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as DatasetItem[],
    limit: Number(data.limit) || 100,
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchDatasets(tenantId: string, projectId: string, token: string) {
  if (tenantId === "all" || projectId === "all") {
    const pairs = await resolveScopePairs(tenantId, projectId, token);
    const batch = pairs.slice(0, 12);
    const responses = await Promise.all(
      batch.map((p) => fetchDatasetsPage(p.tenant_id, p.project_id, token, { limit: 100 }))
    );
    const merged = responses.flatMap((x) => x.items);
    merged.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return { items: merged };
  }
  const page = await fetchDatasetsPage(tenantId, projectId, token, { limit: 100 });
  return { items: page.items };
}

export async function fetchDatasetVersions(tenantId: string, projectId: string, datasetId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/versions`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: DatasetVersionItem[] };
}

export async function fetchDatasetBuffer(tenantId: string, projectId: string, datasetId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/buffer`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    buffer_id: string | null;
    dataset_id: string;
    source_type: string;
    canonical_source_type?: string;
    current_size: number;
    record_count?: number;
    target_threshold: number;
    accumulation_strategy?: string;
    window_status: string;
    window_strategy?: string;
    materialization_strategy?: string;
    started_at?: string | null;
    created_at?: string | null;
    last_ingested_at?: string | null;
    updated_at?: string | null;
    window_start?: string | null;
    window_end?: string | null;
    last_materialized_version_id?: string | null;
    last_materialized_at?: string | null;
  };
}

export async function patchDatasetBuffer(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  payload: { target_threshold: number; accumulation_strategy?: string }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/buffer`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as Awaited<ReturnType<typeof fetchDatasetBuffer>>;
}

export async function materializeDatasetBuffer(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/materialize`, {
    method: "POST",
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    dataset_id: string;
    dataset_version_id: string;
    version: string;
    strategy: string;
    materialized: boolean;
  };
}

export async function materializeScheduledDatasetBuffers(
  tenantId: string,
  projectId: string,
  token: string,
  limit = 50
) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/buffer/materialize-scheduled?limit=${lim}`,
    {
      method: "POST",
      headers: authHeaders(token),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    tenant_id: string;
    project_id: string;
    checked: number;
    materialized_count: number;
    materialized: Array<{ dataset_id: string; dataset_version_id: string; version: string; strategy: string }>;
    skipped: Array<Record<string, unknown>>;
  };
}

export type DatasetTrainingPolicy = {
  policy_id: string;
  model_id?: string | null;
  required_size: number;
  freshness_hours: number;
  trigger_mode: string;
  validation_rules?: Array<Record<string, unknown> | string>;
};

export type DatasetRetentionPolicy = {
  dataset_id: string;
  tenant_id: string;
  project_id: string;
  enabled: boolean;
  max_versions: number | null;
  max_age_days: number | null;
  protect_referenced: boolean;
  updated_at?: string | null;
};

export type DatasetRetentionPreview = {
  policy: DatasetRetentionPolicy;
  total_versions: number;
  eligible_count: number;
  protected_count: number;
  candidates: Array<{
    version_id: string;
    version?: string | null;
    created_at?: string | null;
    reasons: string[];
  }>;
  dry_run?: boolean;
  deleted?: string[];
  skipped?: Array<{ version_id: string; reason: string }>;
  message?: string;
};

export async function fetchDatasetRetentionPolicy(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/retention-policy`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetRetentionPolicy;
}

export async function upsertDatasetRetentionPolicy(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  payload: Pick<DatasetRetentionPolicy, "enabled" | "max_versions" | "max_age_days" | "protect_referenced">
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/retention-policy`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetRetentionPolicy;
}

export async function previewDatasetRetention(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/retention/preview`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetRetentionPreview;
}

export async function applyDatasetRetention(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  dryRun: boolean
) {
  const qs = new URLSearchParams({ dry_run: dryRun ? "true" : "false" });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/retention/apply?${qs}`,
    { method: "POST", headers: authHeaders(token) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetRetentionPreview;
}

export async function fetchDatasetTrainingPolicies(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/training-policies?limit=100`,
    {
      headers: authHeaders(token),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: DatasetTrainingPolicy[] };
}

export async function upsertDatasetTrainingPolicy(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  payload: {
    policy_id?: string;
    model_id?: string | null;
    required_size: number;
    freshness_hours?: number;
    trigger_mode?: string;
    validation_rules?: Array<Record<string, unknown> | string>;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/training-policies`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetTrainingPolicy;
}

export async function createDatasetTrainingPolicy(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  payload: {
    model_id?: string | null;
    required_size: number;
    freshness_hours?: number;
    trigger_mode?: string;
    validation_rules?: Array<Record<string, unknown> | string>;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/training-policies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetTrainingPolicy;
}

export type DatasetReadinessEvaluationItem = {
  evaluation_id: string;
  dataset_version_id?: string | null;
  policy_id?: string | null;
  required_size: number;
  current_size: number;
  status: "eligible" | "blocked" | string;
  source?: string;
  evaluated_at: string;
  reasons?: Array<string | Record<string, unknown>>;
};

export async function fetchDatasetReadinessEvaluationsPage(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  opts?: {
    limit?: number;
    cursor?: string | null;
    status?: string;
    policyId?: string;
    source?: string;
  }
): Promise<CursorPage<DatasetReadinessEvaluationItem>> {
  const safeLimit = Math.max(1, Math.floor(opts?.limit ?? 20));
  const q = new URLSearchParams();
  q.set("limit", String(safeLimit));
  if (opts?.cursor) {
    q.set("cursor", opts.cursor);
  }
  const st = String(opts?.status || "").trim().toLowerCase();
  if (st && st !== "all") q.set("status", st);
  const pid = String(opts?.policyId || "").trim();
  if (pid && pid !== "all") q.set("policy_id", pid);
  const src = String(opts?.source || "").trim().toLowerCase();
  if (src && src !== "all") q.set("source", src);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/readiness/evaluations?${q.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as DatasetReadinessEvaluationItem[],
    limit: Number(data.limit ?? safeLimit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchDatasetReadinessEvaluations(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit = 20,
  offset = 0,
  cursor?: string | null,
  opts?: { status?: string; policyId?: string; source?: string }
) {
  if (!cursor && offset > 0) {
    const safeLimit = Math.max(1, Math.floor(limit));
    const safeOffset = Math.max(0, Math.floor(offset));
    const q = new URLSearchParams();
    q.set("limit", String(safeLimit));
    q.set("offset", String(safeOffset));
    const st = String(opts?.status || "").trim().toLowerCase();
    if (st && st !== "all") q.set("status", st);
    const pid = String(opts?.policyId || "").trim();
    if (pid && pid !== "all") q.set("policy_id", pid);
    const src = String(opts?.source || "").trim().toLowerCase();
    if (src && src !== "all") q.set("source", src);
    const res = await fetch(
      `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/readiness/evaluations?${q.toString()}`,
      { headers: authHeaders(token), cache: "no-store" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data as { items: DatasetReadinessEvaluationItem[] };
  }
  const page = await fetchDatasetReadinessEvaluationsPage(tenantId, projectId, datasetId, token, {
    limit,
    cursor,
    status: opts?.status,
    policyId: opts?.policyId,
    source: opts?.source,
  });
  return { items: page.items };
}

/** Roadmap alias for `fetchDatasetReadinessEvaluations` (`/readiness/history`). */
export async function fetchDatasetReadinessHistory(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit = 20,
  offset = 0,
  cursor?: string | null,
  opts?: { status?: string; policyId?: string }
) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  const q = new URLSearchParams();
  q.set("limit", String(safeLimit));
  if (cursor) {
    q.set("cursor", cursor);
  } else {
    q.set("offset", String(safeOffset));
  }
  const st = String(opts?.status || "").trim().toLowerCase();
  if (st && st !== "all") q.set("status", st);
  const pid = String(opts?.policyId || "").trim();
  if (pid) q.set("policy_id", pid);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/readiness/history?${q.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as Awaited<ReturnType<typeof fetchDatasetReadinessEvaluations>>;
}

export type DatasetTrainingEligibilityRow = {
  policy_id: string;
  model_id?: string | null;
  trigger_mode: string;
  required_size: number;
  current_size: number;
  eligible: boolean;
  status: string;
  dataset_version_id?: string | null;
  reasons: string[];
  error?: string;
};

export async function fetchDatasetTrainingEligibility(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  opts?: { datasetVersionId?: string; policyId?: string }
) {
  const sp = new URLSearchParams();
  if (opts?.datasetVersionId) sp.set("dataset_version_id", opts.datasetVersionId);
  if (opts?.policyId) sp.set("policy_id", opts.policyId);
  const qs = sp.toString();
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/eligibility${qs ? `?${qs}` : ""}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    dataset_id: string;
    dataset_version_id?: string | null;
    items: DatasetTrainingEligibilityRow[];
    eligible: DatasetTrainingEligibilityRow[];
    blocked: DatasetTrainingEligibilityRow[];
  };
}

export async function deleteDataset(tenantId: string, projectId: string, datasetId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { dataset_id: string; deleted: boolean };
}

export async function deleteDatasetByName(
  tenantId: string,
  projectId: string,
  datasetName: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/by-name/${encodeURIComponent(datasetName)}`,
    { method: "DELETE", headers: authHeaders(token) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { dataset_id: string; dataset_name: string; deleted: boolean };
}

export async function downloadDatasetVersion(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string,
  suggestedFilename?: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/dataset-versions/${encodeURIComponent(versionId)}/download`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      throw new Error(JSON.stringify(JSON.parse(text)));
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("{")) throw err;
      throw new Error(text || `download_failed_${res.status}`);
    }
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] || suggestedFilename || `${versionId}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const DATASET_VERSION_PAGE_SIZE = 50;

export type DatasetVersionPreviewPage = {
  version_id: string;
  dataset_id: string;
  version: string;
  filename: string;
  format: "csv" | "jsonl";
  byte_size: number;
  editable: boolean;
  max_editor_bytes: number;
  checksum?: string | null;
  record_count?: number | null;
  offset: number;
  limit: number;
  total_count: number;
  has_more: boolean;
  next_cursor?: string | null;
  columns?: string[];
  rows?: Array<{ row_index: number; values: Record<string, string> }>;
  lines?: Array<{ line_index: number; line: string }>;
};

export type CursorPage<T> = {
  items: T[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
  offset?: number;
};

export async function previewDatasetVersion(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string,
  opts: { offset?: number; limit?: number; cursor?: string | null } = {}
): Promise<DatasetVersionPreviewPage> {
  const sp = new URLSearchParams({
    limit: String(opts.limit ?? DATASET_VERSION_PAGE_SIZE),
  });
  if (opts.cursor) {
    sp.set("cursor", opts.cursor);
  } else {
    sp.set("offset", String(opts.offset ?? 0));
  }
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/dataset-versions/${encodeURIComponent(versionId)}/preview?${sp}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetVersionPreviewPage;
}

export async function patchDatasetVersionContent(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string,
  body: {
    row_patches?: Array<{ row_index: number; values: Record<string, string> }>;
    row_deletes?: number[];
    row_inserts?: Array<{ after_index: number; values: Record<string, string> }>;
    line_patches?: Array<{ line_index: number; line: string }>;
    line_deletes?: number[];
    line_inserts?: Array<{ after_index: number; line: string }>;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/dataset-versions/${encodeURIComponent(versionId)}/content`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    version_id: string;
    record_count: number;
    checksum: string;
    byte_size: number;
    version: DatasetVersionItem;
  };
}

export async function deleteDatasetVersion(
  tenantId: string,
  projectId: string,
  datasetId: string,
  versionId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/versions/${versionId}`,
    {
      method: "DELETE",
      headers: authHeaders(token)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { dataset_id: string; version_id: string; deleted: boolean };
}

export async function fetchModelStatus(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/status`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    model_id: string;
    status: string;
    latest_version?: number;
    run_id?: string | null;
    blocking_datasets?: Array<{ dataset: string; actual_size: number; required_size: number; status: string }>;
  };
}

export async function fetchModelResolvedPipeline(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/resolved-pipeline`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    model_id: string;
    pipeline_id: string | null;
    model_version: number | null;
    run_id: string | null;
    source: string;
    artifact_uri?: string | null;
    base_weights_source?: string | null;
    base_version_id?: string | null;
  };
}

export async function putModelPipelineMapping(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  body: { pipeline_id: string }
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/models/${encodeURIComponent(modelId)}/pipeline-mapping`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    tenant_id: string;
    project_id: string;
    model_id: string;
    pipeline_id: string;
    created_at: string;
    updated_at: string;
  };
}

/** Model + dataset only; MLAir resolves pipeline and production (or latest) base weights. */
export async function triggerRunFromModelDataset(
  tenantId: string,
  projectId: string,
  token: string,
  payload: {
    model_id: string;
    dataset_id: string;
    dataset_version_id?: string;
    policy_id?: string;
    pipeline_id_override?: string;
    idempotency_key?: string | null;
    priority?: string;
    max_parallel_tasks?: number;
    training_mode: string;
    override_config?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem & {
    blocked_by_gate?: boolean;
    readiness?: RunReadiness;
    resolved_pipeline_id?: string;
    resolution?: { pipeline_source?: string; base_weights_source?: string | null };
  };
}

export async function previewDatasetUpload(tenantId: string, projectId: string, token: string, file: File) {
  const scopedProjectId = normalizeProjectId(projectId);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/datasets/upload-preview`, {
    method: "POST",
    headers: authHeaders(token),
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    columns: string[];
    row_count: number;
    null_ratio: Record<string, number>;
    preview: Array<Record<string, string>>;
  };
}

export type DatasetCsvUploadResult = {
  dataset_id: string;
  dataset_name: string;
  version_id: string;
  version: string;
  uri?: string;
  checksum: string;
  status: "ready" | "warning" | "failed";
  quality_score: number;
  summary: string[];
  details: Array<Record<string, unknown>>;
  columns: string[];
  row_count: number;
  record_count?: number;
  null_ratio?: Record<string, number>;
  preview?: Array<Record<string, string>>;
  merged_rows?: number;
};

export async function uploadDatasetCsv(
  tenantId: string,
  projectId: string,
  token: string,
  payload: {
    dataset_name: string;
    file: File;
    required_cols?: string[];
    merge_into_version_id?: string;
  }
) {
  const form = new FormData();
  form.append("dataset_name", payload.dataset_name);
  form.append("file", payload.file);
  if (payload.merge_into_version_id?.trim()) {
    form.append("merge_into_version_id", payload.merge_into_version_id.trim());
  }
  if (payload.required_cols && payload.required_cols.length > 0) {
    form.append("required_cols", JSON.stringify(payload.required_cols));
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/datasets/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetCsvUploadResult;
}

export async function mergeDatasetVersionCsv(
  tenantId: string,
  projectId: string,
  datasetId: string,
  versionId: string,
  token: string,
  payload: { file: File; required_cols?: string[] }
) {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.required_cols && payload.required_cols.length > 0) {
    form.append("required_cols", JSON.stringify(payload.required_cols));
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/datasets/${encodeURIComponent(datasetId)}/versions/${encodeURIComponent(versionId)}/merge`,
    { method: "POST", headers: authHeaders(token), body: form }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetCsvUploadResult;
}

export async function fetchModelTriggerPolicy(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/trigger-policy`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    trigger_mode: "manual" | "auto_ready" | "schedule";
    debounce_minutes: number;
    schedule_cron: string;
    dataset_id?: string | null;
    dataset_version_id?: string | null;
    training_policy_id?: string | null;
    last_trigger_attempt_at?: string | null;
    last_trigger_outcome?: string | null;
    last_skip_reason?: string | null;
  };
}

export async function updateModelTriggerPolicy(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: {
    trigger_mode: "manual" | "auto_ready" | "schedule";
    debounce_minutes: number;
    schedule_cron?: string | null;
    dataset_id?: string | null;
    dataset_version_id?: string | null;
    training_policy_id?: string | null;
  }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/trigger-policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    trigger_mode: "manual" | "auto_ready" | "schedule";
    debounce_minutes: number;
    schedule_cron: string;
    dataset_id?: string | null;
    dataset_version_id?: string | null;
    training_policy_id?: string | null;
  };
}

export async function createModel(
  tenantId: string,
  projectId: string,
  token: string,
  payload: { name: string; description?: string | null }
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelItem;
}

export async function fetchModelVersions(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: ModelVersionItem[] };
}

export async function fetchNextModelArtifactUri(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/next-artifact-uri`,
    {
      headers: authHeaders(token),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { model_id: string; next_version: number; artifact_uri?: string | null };
}

export async function createModelVersion(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: { run_id?: string | null; artifact_uri?: string | null; stage?: string }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelVersionItem;
}

export async function importModelVersion(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: { model_file: File; metadata_file?: File | null; run_id?: string | null; stage?: string }
) {
  const form = new FormData();
  form.append("model_file", payload.model_file);
  if (payload.metadata_file) form.append("metadata_file", payload.metadata_file);
  if (payload.run_id) form.append("run_id", payload.run_id);
  form.append("stage", payload.stage || "staging");

  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions/import`, {
    method: "POST",
    headers: authHeaders(token),
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelVersionItem & { metadata_generated?: boolean };
}

export async function importModelVersionMany(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: { files: File[]; run_id?: string | null; stage?: string }
) {
  const form = new FormData();
  for (const file of payload.files) form.append("files", file);
  if (payload.run_id) form.append("run_id", payload.run_id);
  form.append("stage", payload.stage || "staging");

  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions/import-many`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: form
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelVersionItem & { metadata_generated?: boolean; uploaded_files?: string[] };
}

export type PromotionEligibilityReason = {
  code: string;
  message: string;
  canonical_code?: string | null;
  promote_error?: string;
};

export type PromotionEligibility = {
  model_id: string;
  version: number;
  target_stage: string;
  current_stage?: string | null;
  approval_status?: string | null;
  artifact_uri_present: boolean;
  requires_approval: boolean;
  approval_gate_skipped: boolean;
  eligible: boolean;
  reasons: PromotionEligibilityReason[];
};

export async function fetchPromotionEligibility(
  tenantId: string,
  projectId: string,
  modelId: string,
  version: number,
  token: string,
  targetStage: string
) {
  const qs = new URLSearchParams({ target_stage: targetStage });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions/${version}/promotion-eligibility?${qs}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as PromotionEligibility;
}

export async function promoteModelVersion(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: { version: number; stage?: string }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelVersionItem;
}

export async function updateModelVersionApproval(
  tenantId: string,
  projectId: string,
  modelId: string,
  version: number,
  token: string,
  payload: { approval_status: ModelApprovalStatus; reason?: string | null }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions/${version}/approval`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelVersionItem;
}

/** Requires API `ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1` (GET .../serving mounted at process start). */
export async function fetchModelServing(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/serving`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelServingMatrix;
}

/** Requires API `ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1` (PUT .../serving/{slot}). */
export async function setModelServingSlot(
  tenantId: string,
  projectId: string,
  modelId: string,
  slot: string,
  token: string,
  payload: { version: number }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/serving/${encodeURIComponent(slot)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as ModelServingMatrix;
}

export async function deleteModel(tenantId: string, projectId: string, modelId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { model_id: string; deleted: boolean };
}

export async function deleteModelVersion(
  tenantId: string,
  projectId: string,
  modelId: string,
  version: number,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models/${modelId}/versions/${version}`,
    {
      method: "DELETE",
      headers: authHeaders(token)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { model_id: string; version: number; deleted: boolean };
}

export type SearchResultItem = {
  type: "run" | "task" | "dataset";
  href: string;
  run_id?: string;
  task_id?: string;
  dataset_id?: string;
  name?: string;
  status?: string;
  pipeline_id?: string;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Set when results are merged from aggregate (all) scope fan-out. */
  scope_tenant_id?: string;
  scope_project_id?: string;
};

export type DatasetVersionExternalRef = { url: string; label?: string };

export type DatasetVersionItem = {
  version_id: string;
  version: string;
  uri?: string | null;
  checksum?: string | null;
  created_at: string;
  dataset_id?: string;
  dataset_name?: string;
  source_type?: string;
  /** From API: import | runtime_accumulated | manual | generated | unknown */
  canonical_source_type?: string;
  record_count?: number;
  status?: "ready" | "warning" | "failed";
  quality_score?: number;
  summary?: string[];
  details?: Array<Record<string, unknown>>;
  tags?: string[];
  external_refs?: DatasetVersionExternalRef[];
};

async function searchApiForScope(
  tenantId: string,
  projectId: string,
  token: string,
  q: string,
  type: "all" | "run" | "task" | "dataset" = "all",
  opts?: { limit?: number; cursor?: string | null }
) {
  const scopedProjectId = normalizeProjectId(projectId);
  const limit = opts?.limit ?? 20;
  const sp = new URLSearchParams({ q, type, limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/search?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    q: string;
    items: SearchResultItem[];
    limit?: number;
    has_more?: boolean;
    next_cursor?: string | null;
  };
}

export async function searchApiPage(
  tenantId: string,
  projectId: string,
  token: string,
  q: string,
  type: "all" | "run" | "task" | "dataset" = "all",
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<SearchResultItem> & { q: string }> {
  const trimmed = (q || "").trim();
  const limit = opts?.limit ?? 20;
  if (!trimmed) {
    return { q: trimmed, items: [], limit, has_more: false, next_cursor: null };
  }
  const data = await searchApiForScope(tenantId, projectId, token, trimmed, type, opts);
  return {
    q: data.q,
    items: data.items ?? [],
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function searchApi(
  tenantId: string,
  projectId: string,
  token: string,
  q: string,
  type: "all" | "run" | "task" | "dataset" = "all"
) {
  const trimmed = (q || "").trim();
  if (!trimmed) return { q: trimmed, items: [] as SearchResultItem[], aggregate: false };

  if (tenantId === "all" || projectId === "all") {
    const pairs = await resolveScopePairs(tenantId, projectId, token);
    const maxScopes = 8;
    const batch = pairs.slice(0, maxScopes);
    const perScope = Math.max(4, Math.ceil(20 / Math.max(batch.length, 1)));
    const chunks = await Promise.all(
      batch.map(async (p) => {
        try {
          const r = await searchApiForScope(p.tenant_id, p.project_id, token, trimmed, type, {
            limit: perScope,
          });
          return (r.items || []).map((it) => ({
            ...it,
            scope_tenant_id: p.tenant_id,
            scope_project_id: p.project_id,
          }));
        } catch {
          return [] as SearchResultItem[];
        }
      })
    );
    const items = chunks.flat().slice(0, 20);
    return { q: trimmed, items, aggregate: true as const };
  }

  const data = await searchApiForScope(tenantId, projectId, token, trimmed, type);
  return { ...data, aggregate: false as const };
}

export async function fetchLineageForRun(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/lineage/runs/${encodeURIComponent(runId)}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    run_id: string;
    edges: Array<{
      edge_id: string;
      task_id: string;
      input_version_id: string | null;
      output_version_id: string | null;
      input_dataset_id?: string | null;
      input_dataset_name?: string | null;
      output_dataset_id?: string | null;
      output_dataset_name?: string | null;
      input_version?: string | null;
      output_version?: string | null;
    }>;
  };
}

export async function fetchLineageNeighborhood(
  tenantId: string,
  projectId: string,
  token: string,
  datasetVersionId: string,
  depth: number = 2,
  direction: "up" | "down" | "both" = "both"
) {
  const sp = new URLSearchParams({
    dataset_version_id: datasetVersionId,
    depth: String(depth),
    direction
  });
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/lineage?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    center: string;
    edges: Array<{
      edge_id: string;
      run_id: string;
      task_id: string;
      input_dataset_version_id: string | null;
      output_dataset_version_id: string | null;
    }>;
    dataset_version_ids: string[];
    dataset_versions?: DatasetVersionItem[];
  };
}

export async function fetchDatasetVersion(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/dataset-versions/${versionId}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetVersionItem;
}

export async function patchDatasetVersionMetadata(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string,
  body: { append_tags?: string[]; append_external_refs?: DatasetVersionExternalRef[] }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/dataset-versions/${encodeURIComponent(versionId)}/metadata`,
    {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as DatasetVersionItem;
}

export async function fetchDatasetRunsPage(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  opts?: { limit?: number; cursor?: string | null }
): Promise<CursorPage<RunItem>> {
  const limit = opts?.limit ?? 20;
  const sp = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/runs?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return {
    items: (data.items ?? []) as RunItem[],
    limit: Number(data.limit ?? limit),
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchDatasetRuns(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit: number = 20,
  cursor?: string | null
) {
  const page = await fetchDatasetRunsPage(tenantId, projectId, datasetId, token, { limit, cursor });
  return { items: page.items };
}

export async function listPipelineVersionsApi(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string
) {
  return fetchPipelineVersions(tenantId, projectId, pipelineId, token);
}

export async function createPipelineVersionApi(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  config: Record<string, unknown>
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipelines/${encodeURIComponent(pipelineId)}/versions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ config })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { version_id: string; version: number; config: unknown; created_at: string; pipeline_id: string };
}

export async function getPipelineVersionApi(
  tenantId: string,
  projectId: string,
  versionId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipeline-versions/${versionId}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { version_id: string; version: number; config: unknown; created_at: string; pipeline_id: string };
}

export async function getPipelineVersionDiff(
  tenantId: string,
  projectId: string,
  token: string,
  versionId: string,
  otherVersionId: string
) {
  const sp = new URLSearchParams({ other: otherVersionId });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipeline-versions/${versionId}/diff?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { changed_keys: string[]; details: Array<{ key: string; left: unknown; right: unknown }> };
}

export async function replayFromTask(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  body: { from_task_id: string; idempotency_key?: string | null }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem;
}
