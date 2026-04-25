export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export type RunItem = {
  run_id: string;
  tenant_id: string;
  project_id: string;
  pipeline_id: string;
  status: string;
  idempotency_key?: string | null;
  priority?: string;
  updated_at?: string;
  created_at?: string;
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

export type ModelVersionItem = {
  version_id: string;
  model_id: string;
  version: number;
  run_id?: string | null;
  artifact_uri?: string | null;
  stage: string;
  created_at: string;
};

function authHeaders(token: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchRuns(tenantId: string, projectId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs?limit=50`, {
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
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunItem;
}

export async function fetchRunTasks(tenantId: string, projectId: string, runId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/tasks`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: TaskItem[] };
}

export async function fetchRunLogs(tenantId: string, projectId: string, runId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/logs`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: LogItem[] };
}

export async function replayDlq(tenantId: string, projectId: string, runId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/dlq/replay`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { run_id: string; replayed: number };
}

export async function fetchPipelines(tenantId: string, projectId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipelines?limit=100`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: PipelineItem[] };
}

export async function fetchPipelineDag(tenantId: string, projectId: string, pipelineId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/pipelines/${pipelineId}/dag`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { pipeline_id: string; run_id?: string; nodes: Array<{ id: string; label: string; status: string }>; edges: Array<{ source: string; target: string }> };
}

export async function fetchTask(tenantId: string, projectId: string, taskId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/tasks/${taskId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as TaskItem & { tenant_id: string; project_id: string; pipeline_id: string };
}

export async function fetchRunTracking(tenantId: string, projectId: string, runId: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/${runId}/tracking`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as RunTracking;
}

export async function compareRunMetrics(tenantId: string, projectId: string, runIds: string[], token: string) {
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/runs/compare`, {
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
  const res = await fetch(`${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}/models`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { items: ModelItem[] };
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
