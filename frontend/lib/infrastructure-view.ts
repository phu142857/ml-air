import type { Cluster, Region } from "@/lib/distributed-api";

/** Matches backend `cluster_registry_service.HEARTBEAT_STALE_SECONDS` + offline display threshold. */
export const HEARTBEAT_THRESHOLDS = {
  backendStale: 120,
  offline: 300,
} as const;

export type ClusterHealth = "healthy" | "stale" | "offline" | "unknown";
export type RegionHealthStatus = "no_clusters" | "healthy" | "degraded" | "stale" | "offline";

export function resolveClusterHealth(
  status: string | null | undefined,
  heartbeatAt: string | null | undefined,
): ClusterHealth {
  const backend = String(status || "")
    .trim()
    .toLowerCase();
  const sec = heartbeatSecondsAgo(heartbeatAt);

  if (sec !== null && sec >= HEARTBEAT_THRESHOLDS.offline) return "offline";
  if (backend === "healthy") return "healthy";
  if (backend === "stale") return "stale";
  if (sec === null) return "offline";
  if (backend === "unknown") return "unknown";
  return "offline";
}

export function healthLabel(health: ClusterHealth | RegionHealthStatus): string {
  if (health === "healthy") return "Healthy";
  if (health === "stale") return "Stale";
  if (health === "offline") return "Offline";
  if (health === "degraded") return "Degraded";
  if (health === "no_clusters") return "No clusters";
  return "Unknown";
}

export function heartbeatSecondsAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}

export function formatHeartbeatAgo(iso: string | null | undefined): string {
  const sec = heartbeatSecondsAgo(iso);
  if (sec === null) return "—";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function clusterHealthTooltip(
  health: ClusterHealth,
  heartbeatAt: string | null | undefined,
  backendStatus?: string | null,
): string {
  const ago = formatHeartbeatAgo(heartbeatAt);
  const backend = String(backendStatus || "unknown");
  const { backendStale, offline } = HEARTBEAT_THRESHOLDS;

  if (health === "healthy") {
    return [
      "Healthy",
      "Cluster agent heartbeat is current",
      ago === "—" ? "Last heartbeat: never" : `Last heartbeat: ${ago}`,
      `Backend status: ${backend}`,
    ].join("\n");
  }
  if (health === "stale") {
    return [
      "Stale",
      `Backend marks stale after ${backendStale}s without heartbeat`,
      ago === "—" ? "Last heartbeat: never" : `Last heartbeat: ${ago}`,
      `Backend status: ${backend}`,
    ].join("\n");
  }
  if (health === "offline") {
    return [
      "Offline",
      `No heartbeat for ${Math.floor(offline / 60)}+ minutes`,
      ago === "—" ? "Last heartbeat: never" : `Last heartbeat: ${ago}`,
      `Backend status: ${backend}`,
    ].join("\n");
  }
  return ["Unknown", `Backend status: ${backend}`].join("\n");
}

function hasCapacityKey(capacity: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => key in capacity && capacity[key] != null);
}

export function parseGpuCapacity(capacity: Record<string, unknown> | undefined): { used: number; total: number } | null {
  if (!capacity) return null;
  const total = Number(capacity.gpu_available ?? capacity.gpu_total ?? NaN);
  const used = Number(capacity.gpu_used ?? NaN);
  if (Number.isFinite(total)) {
    return { used: Number.isFinite(used) ? used : 0, total };
  }
  return null;
}

export function parseCpuCapacity(capacity: Record<string, unknown> | undefined): { used: number; total: number } | null {
  if (!capacity) return null;
  const total = Number(capacity.cpu_cores_available ?? capacity.cpu_total ?? NaN);
  const used = Number(capacity.cpu_used ?? NaN);
  if (Number.isFinite(total)) {
    return { used: Number.isFinite(used) ? used : 0, total };
  }
  return null;
}

export function parseMemoryCapacity(
  capacity: Record<string, unknown> | undefined,
): { used: number; total: number } | null {
  if (!capacity) return null;
  const total = Number(
    capacity.memory_gb_available ?? capacity.memory_total_gb ?? capacity.memory_gb ?? NaN,
  );
  const used = Number(capacity.memory_gb_used ?? capacity.memory_used_gb ?? NaN);
  if (Number.isFinite(total)) {
    return { used: Number.isFinite(used) ? used : 0, total };
  }
  return null;
}

export type CapacityPart = { label: string; value: string };

export function getCapacityParts(capacity: Record<string, unknown> | undefined): CapacityPart[] {
  if (!capacity || Object.keys(capacity).length === 0) return [];

  const parts: CapacityPart[] = [];

  if (hasCapacityKey(capacity, "gpu_available", "gpu_total", "gpu")) {
    const gpu = parseGpuCapacity(capacity);
    if (gpu) {
      parts.push({
        label: "GPU",
        value: gpu.total > 0 ? `${gpu.used}/${gpu.total}` : "—",
      });
    }
  }
  if (hasCapacityKey(capacity, "cpu_cores_available", "cpu_total", "cpu")) {
    const cpu = parseCpuCapacity(capacity);
    if (cpu && cpu.total > 0) parts.push({ label: "CPU", value: `${cpu.used}/${cpu.total}` });
  }
  if (hasCapacityKey(capacity, "memory_gb_available", "memory_total_gb", "memory_gb")) {
    const mem = parseMemoryCapacity(capacity);
    if (mem && mem.total > 0) parts.push({ label: "RAM", value: `${mem.used}/${mem.total} GB` });
  }

  return parts;
}

export function getRegionCapacityParts(clusters: Cluster[]): CapacityPart[] {
  if (clusters.length === 0) return [];

  const gpu = { used: 0, total: 0, has: false };
  const cpu = { used: 0, total: 0, has: false };
  const mem = { used: 0, total: 0, has: false };

  for (const cluster of clusters) {
    const cap = cluster.capacity;
    if (!cap) continue;
    const g = parseGpuCapacity(cap);
    if (g && g.total > 0) {
      gpu.has = true;
      gpu.used += g.used;
      gpu.total += g.total;
    }
    const c = parseCpuCapacity(cap);
    if (c && c.total > 0) {
      cpu.has = true;
      cpu.used += c.used;
      cpu.total += c.total;
    }
    const m = parseMemoryCapacity(cap);
    if (m && m.total > 0) {
      mem.has = true;
      mem.used += m.used;
      mem.total += m.total;
    }
  }

  const parts: CapacityPart[] = [];
  if (gpu.has) parts.push({ label: "GPU", value: gpu.total > 0 ? `${gpu.used}/${gpu.total}` : "—" });
  if (cpu.has) parts.push({ label: "CPU", value: `${cpu.used}/${cpu.total}` });
  if (mem.has) parts.push({ label: "RAM", value: `${mem.used}/${mem.total} GB` });
  return parts;
}

/** @deprecated Use getCapacityParts */
export function formatGpuCapacityDisplay(capacity: Record<string, unknown> | undefined): string {
  const parts = getCapacityParts(capacity);
  const gpu = parts.find((p) => p.label === "GPU");
  return gpu ? `${gpu.value} GPU` : "—";
}

/** @deprecated Use getRegionCapacityParts */
export function formatRegionGpuCapacity(clusters: Cluster[]): string {
  const parts = getRegionCapacityParts(clusters);
  const gpu = parts.find((p) => p.label === "GPU");
  return gpu ? `${gpu.value} GPU` : "—";
}

export function formatResourceDetail(
  capacity: Record<string, unknown> | undefined,
  parser: (cap: Record<string, unknown> | undefined) => { used: number; total: number } | null,
  keys: string[],
  unit: string,
): string {
  if (!capacity || Object.keys(capacity).length === 0) return "—";
  if (!hasCapacityKey(capacity, ...keys)) return "—";
  const parsed = parser(capacity);
  if (!parsed) return "—";
  if (parsed.total === 0) return "—";
  return `${parsed.used} / ${parsed.total} ${unit} used`;
}

export function formatInfraRunningCount(clusterCount: number, running?: number | null): string {
  if (clusterCount === 0) return "—";
  if (running === null || running === undefined) return "0";
  return String(running);
}

export function clusterProjectId(cluster: Cluster): string | null {
  const labels = cluster.labels ?? {};
  const project = labels.project ?? labels.mlair_project ?? labels.MLAIR_PROJECT;
  if (!project) return null;
  const value = String(project).trim();
  return value || null;
}

export function clusterTenantId(cluster: Cluster, fallback?: string): string | null {
  const labels = cluster.labels ?? {};
  const tenant = labels.tenant ?? labels.mlair_tenant ?? labels.MLAIR_TENANT;
  if (tenant) {
    const value = String(tenant).trim();
    if (value) return value;
  }
  return fallback?.trim() || null;
}

export type ClusterProjectScope = { tenant: string; project: string };

export function clusterProjectScopes(
  clusters: Cluster[],
  accessibleScopes: { tenant_id: string; project_id: string }[],
  fallbackTenant: string,
): ClusterProjectScope[] {
  const pairs: ClusterProjectScope[] = [];
  const seen = new Set<string>();
  for (const cluster of clusters) {
    const project = clusterProjectId(cluster);
    if (!project) continue;
    const labelTenant = clusterTenantId(cluster);
    const scopeTenant = accessibleScopes.find((s) => s.project_id === project)?.tenant_id;
    const tenant = labelTenant || scopeTenant || fallbackTenant;
    const key = `${tenant}:${project}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ tenant, project });
  }
  return pairs;
}

export function buildRunningCounts(
  clusters: Cluster[],
  runsByProject: Record<string, number>,
): { byCluster: Map<string, number>; byRegion: Map<string, number> } {
  const byCluster = new Map<string, number>();
  const byRegion = new Map<string, number>();
  for (const cluster of clusters) {
    const project = clusterProjectId(cluster);
    const running = project ? (runsByProject[project] ?? 0) : 0;
    byCluster.set(cluster.cluster_id, running);
    byRegion.set(cluster.region_id, (byRegion.get(cluster.region_id) ?? 0) + running);
  }
  return { byCluster, byRegion };
}

export function groupClustersByRegion(
  regions: Region[],
  clusters: Cluster[],
): Map<string, { region: Region; clusters: Cluster[] }> {
  const byId = new Map(regions.map((r) => [r.region_id, r]));
  const grouped = new Map<string, { region: Region; clusters: Cluster[] }>();
  for (const region of regions) {
    grouped.set(region.region_id, { region, clusters: [] });
  }
  for (const cluster of clusters) {
    const region = byId.get(cluster.region_id);
    if (!region) continue;
    const entry = grouped.get(cluster.region_id) ?? { region, clusters: [] };
    entry.clusters.push(cluster);
    grouped.set(cluster.region_id, entry);
  }
  return grouped;
}

export function countHealthyClusters(clusters: Cluster[]): number {
  return clusters.filter(
    (c) =>
      String(c.health_status || "").toLowerCase() === "healthy" &&
      Boolean(c.last_heartbeat_at) &&
      resolveClusterHealth(c.health_status, c.last_heartbeat_at) === "healthy",
  ).length;
}

export function regionDisplayHealth(_region: Region, clusters: Cluster[]): RegionHealthStatus {
  if (clusters.length === 0) return "no_clusters";
  const healths = clusters.map((c) => resolveClusterHealth(c.health_status, c.last_heartbeat_at));
  if (healths.every((h) => h === "healthy")) return "healthy";
  if (healths.every((h) => h !== "healthy")) {
    if (healths.every((h) => h === "stale")) return "stale";
    return "offline";
  }
  return "degraded";
}

export function matchesHealthFilter(health: ClusterHealth | RegionHealthStatus, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "degraded") return health === "degraded";
  return health === filter;
}

export function matchesSearch(
  query: string,
  region: Region,
  clusters: Cluster[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (region.name.toLowerCase().includes(q) || region.code.toLowerCase().includes(q)) return true;
  return clusters.some((c) => c.name.toLowerCase().includes(q));
}
