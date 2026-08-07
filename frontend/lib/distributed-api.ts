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
};

export type GlobalDashboard = {
  enabled: boolean;
  regions?: { total: number; healthy: number; items: Region[] };
  clusters?: { total: number; healthy: number; stale_or_unknown: number };
  cluster_items?: Cluster[];
  scheduler?: { queue_depth: { total: number } };
  replication?: { pending: number; synced: number };
};

export async function fetchGlobalDashboard(token: string): Promise<GlobalDashboard> {
  const res = await fetch(`${API_BASE}/v1/distributed/observability/global`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as GlobalDashboard;
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
