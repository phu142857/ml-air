import { recordTrainIntentTelemetry } from "./train-intent-telemetry";
import { buildAuditTimelineSearchParams, type AuditTimelineFilters } from "./audit-timeline-filters";

type RuntimeConfigGlobal = {
  __ML_AIR_RUNTIME_CONFIG__?: { api_base_url?: string | null; realtime_base_url?: string | null } | null;
};

export function getApiBaseUrl(): string {
  // Runtime-config first (deploy-time injection), then build-time env, then localhost fallback.
  if (typeof window !== "undefined") {
    const g = window as unknown as RuntimeConfigGlobal;
    const raw = String(g.__ML_AIR_RUNTIME_CONFIG__?.api_base_url || "").trim();
    if (raw) return raw;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
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

export type LogItem = {
  ts: string;
  level: string;
  message: string;
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
  tenant_id: string;
  project_id: string;
  pipeline_id: string;
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

export type PluginItem = {
  name: string;
  version: string;
  engine_version: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  ui_schema?: Record<string, unknown> | null;
  enabled: boolean;
};

export type ModelItem = {
  model_id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
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

export type RuntimeConfigResponse = {
  environment: string;
  api_base_url?: string | null;
  realtime_base_url?: string | null;
  default_tenant_hint?: string | null;
  default_project_hint?: string | null;
  features?: Record<string, boolean>;
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
  const url = opts?.preferRelative ? "/v1/runtime-config" : `${API_BASE}/v1/runtime-config`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as RuntimeConfigResponse;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
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

/** Unified audit-ish timeline (readiness evals, model events, run/task snapshots). */
export async function fetchAuditTimeline(
  tenantId: string,
  projectId: string,
  token: string,
  opts?: { limit?: number; filters?: AuditTimelineFilters }
): Promise<{ items: AuditTimelineItem[] }> {
  if (tenantId === "all" || projectId === "all") {
    return { items: [] };
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const lim = Math.min(200, Math.max(1, opts?.limit ?? 25));
  const filters = opts?.filters ?? {};
  const qs = buildAuditTimelineSearchParams(filters, lim);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/audit/timeline?${qs}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store"
    }
  );
  if (!res.ok) return { items: [] };
  return (await res.json()) as { items: AuditTimelineItem[] };
}

export async function triggerRun(
  tenantId: string,
  projectId: string,
  token: string,
  payload: { pipeline_id: string; idempotency_key?: string | null; priority: string; max_parallel_tasks: number }
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

export async function fetchRunLogs(tenantId: string, projectId: string, runId: string, token: string) {
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs/${runId}/logs`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: LogItem[] };
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

export async function fetchPipelineVersions(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${normalizeProjectId(projectId)}/pipelines/${encodeURIComponent(pipelineId)}/versions?limit=20`,
    {
      headers: authHeaders(token),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: PipelineVersionItem[] };
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
  recordTrainIntentTelemetry({
    intent: "pipeline_gated_run",
    tenant_id: tenantId,
    project_id: scopedProjectId,
    pipeline_id: pipelineId
  });
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

export async function fetchDatasets(tenantId: string, projectId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: DatasetItem[] };
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

export async function fetchDatasetReadinessEvaluations(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit = 20,
  offset = 0,
  opts?: { status?: string; policyId?: string; source?: string }
) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  const q = new URLSearchParams();
  q.set("limit", String(safeLimit));
  q.set("offset", String(safeOffset));
  const st = String(opts?.status || "").trim().toLowerCase();
  if (st && st !== "all") q.set("status", st);
  const pid = String(opts?.policyId || "").trim();
  if (pid) q.set("policy_id", pid);
  const src = String(opts?.source || "").trim().toLowerCase();
  if (src && src !== "all") q.set("source", src);
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/readiness/evaluations?${q.toString()}`,
    {
      headers: authHeaders(token),
      cache: "no-store"
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    items: Array<{
      evaluation_id: string;
      dataset_version_id?: string | null;
      policy_id?: string | null;
      required_size: number;
      current_size: number;
      status: "eligible" | "blocked" | string;
      source?: string;
      evaluated_at: string;
      reasons?: Array<string | Record<string, unknown>>;
    }>;
  };
}

/** Roadmap alias for `fetchDatasetReadinessEvaluations` (`/readiness/history`). */
export async function fetchDatasetReadinessHistory(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit = 20,
  offset = 0,
  opts?: { status?: string; policyId?: string }
) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  const q = new URLSearchParams();
  q.set("limit", String(safeLimit));
  q.set("offset", String(safeOffset));
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
  recordTrainIntentTelemetry({
    intent: "hub_runs_trigger",
    tenant_id: tenantId,
    project_id: scopedProjectId,
    dataset_id: payload.dataset_id,
    model_id: payload.model_id
  });
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
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/upload-preview`, {
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

export async function uploadDatasetCsv(
  tenantId: string,
  projectId: string,
  token: string,
  payload: { dataset_name: string; file: File; required_cols?: string[] }
) {
  const form = new FormData();
  form.append("dataset_name", payload.dataset_name);
  form.append("file", payload.file);
  if (payload.required_cols && payload.required_cols.length > 0) {
    form.append("required_cols", JSON.stringify(payload.required_cols));
  }
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as {
    dataset_id: string;
    dataset_name: string;
    version_id: string;
    version: string;
    uri: string;
    checksum: string;
    status: "ready" | "warning" | "failed";
    quality_score: number;
    summary: string[];
    details: Array<Record<string, unknown>>;
    columns: string[];
    row_count: number;
    null_ratio: Record<string, number>;
    preview: Array<Record<string, string>>;
  };
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
  };
}

export async function updateModelTriggerPolicy(
  tenantId: string,
  projectId: string,
  modelId: string,
  token: string,
  payload: { trigger_mode: "manual" | "auto_ready" | "schedule"; debounce_minutes: number; schedule_cron?: string | null }
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
  };
}

export async function createModel(
  tenantId: string,
  projectId: string,
  token: string,
  payload: { name: string; description?: string | null }
) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models`, {
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

export async function searchApi(
  tenantId: string,
  projectId: string,
  token: string,
  q: string,
  type: "all" | "run" | "task" | "dataset" = "all"
) {
  const sp = new URLSearchParams({ q, type, limit: "20" });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/search?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { q: string; items: SearchResultItem[] };
}

export async function fetchLineageForRun(tenantId: string, projectId: string, runId: string, token: string) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/lineage/runs/${runId}`,
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
      input_dataset_name?: string | null;
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
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/lineage?${sp.toString()}`,
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

export async function fetchDatasetRuns(
  tenantId: string,
  projectId: string,
  datasetId: string,
  token: string,
  limit: number = 20
) {
  const sp = new URLSearchParams({ limit: String(limit), offset: "0" });
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/datasets/${datasetId}/runs?${sp.toString()}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: RunItem[] };
}

export async function listPipelineVersionsApi(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipelines/${encodeURIComponent(pipelineId)}/versions`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: Array<{ version_id: string; version: number; config: unknown; created_at: string }> };
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
