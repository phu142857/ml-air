import { getApiBaseUrl } from "./api";

const API_BASE = getApiBaseUrl();

function headers(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export type Region = {
  region_id: string;
  code: string;
  name: string;
  health_status: string;
  preference_weight: number;
};

export type Cluster = {
  cluster_id: string;
  region_id: string;
  name: string;
  api_endpoint: string;
  health_status: string;
  capacity: Record<string, unknown>;
  last_heartbeat_at: string | null;
  created_at?: string | null;
  labels?: Record<string, unknown>;
};

export type GlobalDashboard = {
  enabled: boolean;
  regions?: { total: number; healthy: number; items: Region[] };
  clusters?: { total: number; healthy: number; stale_or_unknown: number };
  cluster_items?: Cluster[];
  scheduler?: { queue_depth: { total: number; fifo?: number; priority?: number } };
  workloads?: { running: number; queued: number };
  replication?: { pending: number; synced: number };
};

export type FederationItem = {
  federation_id: string;
  name: string;
  parent_federation_id?: string | null;
  scope: string;
  config?: Record<string, unknown>;
  regions?: Array<{ region_id: string; tenant_scope?: string | null; policy_scope?: Record<string, unknown> }>;
  created_at?: string | null;
};

export type EdgeNodeItem = {
  edge_id: string;
  cluster_id: string;
  name: string;
  deployment_kind: string;
  sync_mode: string;
  last_sync_at?: string | null;
  config?: Record<string, unknown>;
  created_at?: string | null;
};

export type DrSnapshotItem = {
  snapshot_id: string;
  scope: string;
  region_id?: string | null;
  created_at?: string | null;
};

export type RunPlacementSummary = {
  placement_id?: string;
  cluster_id?: string;
  cluster_name?: string;
  region_id?: string;
  region_code?: string;
  node_pool?: string | null;
  node_id?: string | null;
  score?: number | null;
};

export async function fetchGlobalDashboard(token: string): Promise<GlobalDashboard> {
  const res = await fetch(`${API_BASE}/v1/distributed/observability/global`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as GlobalDashboard;
}

export async function fetchCluster(token: string, clusterId: string): Promise<Cluster> {
  const res = await fetch(`${API_BASE}/v1/distributed/clusters/${encodeURIComponent(clusterId)}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Cluster;
}

export async function fetchClusters(token: string, regionId?: string): Promise<{ items: Cluster[] }> {
  const q = regionId ? `?region_id=${encodeURIComponent(regionId)}` : "";
  const res = await fetch(`${API_BASE}/v1/distributed/clusters${q}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: Cluster[] };
}

export async function fetchRegions(token: string): Promise<{ items: Region[] }> {
  const res = await fetch(`${API_BASE}/v1/distributed/regions`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: Region[] };
}

export async function fetchFederations(token: string): Promise<{ items: FederationItem[] }> {
  const res = await fetch(`${API_BASE}/v1/distributed/federations`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: FederationItem[] };
}

export async function fetchEdgeNodes(token: string, clusterId?: string): Promise<{ items: EdgeNodeItem[] }> {
  const q = clusterId ? `?cluster_id=${encodeURIComponent(clusterId)}` : "";
  const res = await fetch(`${API_BASE}/v1/distributed/edge-nodes${q}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: EdgeNodeItem[] };
}

export async function syncEdgeNode(token: string, edgeId: string) {
  const res = await fetch(`${API_BASE}/v1/distributed/edge-nodes/${encodeURIComponent(edgeId)}/sync`, {
    method: "POST",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchDrSnapshots(token: string): Promise<{ items: DrSnapshotItem[] }> {
  const res = await fetch(`${API_BASE}/v1/distributed/dr/snapshots`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: DrSnapshotItem[] };
}

export async function createDrSnapshot(token: string, body?: { scope?: string; region_id?: string }) {
  const res = await fetch(`${API_BASE}/v1/distributed/dr/snapshots`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body ?? { scope: "global" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DrSnapshotItem & { item_counts?: Record<string, number> };
}

export async function restoreDrSnapshot(token: string, snapshotId: string, dryRun = true) {
  const res = await fetch(
    `${API_BASE}/v1/distributed/dr/snapshots/${encodeURIComponent(snapshotId)}/restore?dry_run=${dryRun ? "true" : "false"}`,
    { method: "POST", headers: headers(token) },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Record<string, unknown>;
}
