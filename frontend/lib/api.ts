export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

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

export type WhoAmIResponse = {
  role: string;
  tenant_id?: string;
  project_ids?: string[];
};

function normalizeProjectId(projectId: string): string {
  const raw = String(projectId || "").trim().toLowerCase();
  if (raw === "global") return "default_project";
  return String(projectId || "").trim();
}

export type ModelVersionItem = {
  version_id: string;
  model_id: string;
  version: number;
  run_id?: string | null;
  artifact_uri?: string | null;
  stage: string;
  created_at: string;
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
  // "all" must include global scope even when project listing is sparse.
  return Array.from(new Set(["default_project", ...ids.map((x) => String(x).trim())]));
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

export async function fetchTenantProjects(tenantId: string, token: string): Promise<string[]> {
  return fetchProjectsForTenant(tenantId, token);
}

export async function fetchRuns(tenantId: string, projectId: string, token: string) {
  if (projectId === "all") {
    const projectIds = await fetchProjectsForTenant(tenantId, token);
    const responses = await Promise.all(
      projectIds.map(async (pid) => {
        const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${pid}/runs?limit=50`, {
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
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/runs?limit=50`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`fetch_runs_failed:${res.status}`);
  }
  return (await res.json()) as { items: RunItem[] };
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
  if (projectId === "all") {
    const projectIds = await fetchProjectsForTenant(tenantId, token);
    const responses = await Promise.all(
      projectIds.map(async (pid) => {
        const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${pid}/pipelines?limit=100`, {
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
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/pipelines?limit=100`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: PipelineItem[] };
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

export async function checkPipelineReadiness(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  payload: { training_mode: string; override_config?: Record<string, unknown> }
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
    override_config?: Record<string, unknown>;
  }
) {
  const res = await fetch(
    `${API_BASE}/v1/tenants/${tenantId}/projects/${normalizeProjectId(projectId)}/pipelines/${encodeURIComponent(pipelineId)}/run`,
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
  if (projectId === "all") {
    const projectIds = await fetchProjectsForTenant(tenantId, token);
    const responses = await Promise.all(
      projectIds.map(async (pid) => {
        const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${pid}/models`, {
          headers: authHeaders(token),
          cache: "no-store"
        });
        if (!res.ok) return { items: [] as ModelItem[] };
        return (await res.json()) as { items: ModelItem[] };
      })
    );
    const merged = responses.flatMap((x) => x.items || []);
    merged.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    return { items: merged };
  }
  const scopedProjectId = normalizeProjectId(projectId);
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${scopedProjectId}/models`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: ModelItem[] };
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

export type DatasetVersionItem = {
  version_id: string;
  version: string;
  uri?: string | null;
  checksum?: string | null;
  created_at: string;
  dataset_id: string;
  dataset_name: string;
  status?: "ready" | "warning" | "failed";
  quality_score?: number;
  summary?: string[];
  details?: Array<Record<string, unknown>>;
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
