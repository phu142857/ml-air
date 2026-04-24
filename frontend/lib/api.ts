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
  updated_at?: string;
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
