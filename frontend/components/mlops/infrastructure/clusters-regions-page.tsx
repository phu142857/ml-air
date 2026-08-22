"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Search, Server } from "lucide-react";

import { ClusterDetailDrawer } from "@/components/mlops/infrastructure/cluster-detail-drawer";
import { DrSnapshotsPanel } from "@/components/mlops/infrastructure/dr-snapshots-panel";
import { EdgeNodesPanel } from "@/components/mlops/infrastructure/edge-nodes-panel";
import { FederationAdminPanel } from "@/components/mlops/infrastructure/federation-admin-panel";
import { MlopsEmptyState, PageScrollBody, PageToolbar, ResourcePageHeader, DetailTabList } from "@/components/mlops/layout";
import { Input } from "@/components/ui/input";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppContext } from "@/lib/app-context";
import { fetchRunsPage } from "@/lib/api";
import {
  fetchClusters,
  fetchGlobalDashboard,
  fetchRegions,
  type Cluster,
  type Region,
} from "@/lib/distributed-api";
import {
  buildRunningCounts,
  clusterHealthTooltip,
  clusterProjectId,
  clusterProjectScopes,
  countHealthyClusters,
  formatHeartbeatAgo,
  formatInfraRunningCount,
  getCapacityParts,
  getRegionCapacityParts,
  groupClustersByRegion,
  healthLabel,
  matchesHealthFilter,
  matchesSearch,
  regionDisplayHealth,
  resolveClusterHealth,
  type CapacityPart,
  type ClusterHealth,
  type RegionHealthStatus,
} from "@/lib/infrastructure-view";
import { resolveInfraRefetchInterval } from "@/lib/realtime-query-polling";
import { cn, formatApiClientError } from "@/lib/utils";
import { Tabs, TabsContent } from "@/components/ui/tabs";

const INFRA_TABS = [
  { id: "clusters", label: "Clusters" },
  { id: "federation", label: "Federation" },
  { id: "edge", label: "Edge" },
  { id: "dr", label: "DR" },
] as const;

const HEALTH_FILTER_OPTIONS = [
  { value: "all", label: "All health" },
  { value: "healthy", label: "Healthy" },
  { value: "degraded", label: "Degraded" },
  { value: "stale", label: "Stale" },
  { value: "offline", label: "Offline" },
  { value: "no_clusters", label: "No clusters" },
];

function healthDotClass(health: ClusterHealth | RegionHealthStatus): string {
  if (health === "healthy") return "bg-[color:var(--status-success-fg)]";
  if (health === "degraded" || health === "stale") return "bg-[color:var(--status-pending-fg)]";
  if (health === "offline") return "bg-[color:var(--status-failed-fg)]";
  return "bg-muted-foreground";
}

function CapacityCell({ parts }: { parts: CapacityPart[] }) {
  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {parts.map((part) => (
        <div key={part.label} className="tabular-nums leading-tight">
          <span className="text-muted-foreground">{part.label}</span> {part.value}
        </div>
      ))}
    </div>
  );
}

function HealthIndicator({
  health,
  heartbeatAt,
  backendStatus,
  className,
}: {
  health: ClusterHealth | RegionHealthStatus;
  heartbeatAt?: string | null;
  backendStatus?: string | null;
  className?: string;
}) {
  if (health === "no_clusters") {
    return <span className={cn("text-xs text-muted-foreground", className)}>No clusters</span>;
  }

  const indicator = (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", healthDotClass(health))} aria-hidden />
      {healthLabel(health)}
    </span>
  );

  if (health === "degraded") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help text-left">
            {indicator}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
          Degraded{"\n"}Mixed cluster health in this region
        </TooltipContent>
      </Tooltip>
    );
  }

  if (health === "healthy" && !backendStatus) return indicator;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help text-left">
          {indicator}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
        {clusterHealthTooltip(health as ClusterHealth, heartbeatAt, backendStatus)}
      </TooltipContent>
    </Tooltip>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function ClustersRegionsPage({
  activeTab: activeTabProp,
  onTabChange,
}: {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
} = {}) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading infrastructure…</p>}>
      <ClustersRegionsPageContent activeTab={activeTabProp} onTabChange={onTabChange} />
    </Suspense>
  );
}

function ClustersRegionsPageContent({
  activeTab: activeTabProp,
  onTabChange,
}: {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, tenantId, accessibleScopes } = useAppContext();
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(() => new Set());
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showEmptyRegions, setShowEmptyRegions] = useState(true);
  const [internalTab, setInternalTab] = useState("clusters");
  const tab = activeTabProp ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  useEffect(() => {
    const clusterFromUrl = searchParams.get("cluster");
    if (clusterFromUrl) {
      setSelectedClusterId(clusterFromUrl);
      router.replace("/infra");
    }
  }, [searchParams, router]);

  const dashQ = useQuery({
    queryKey: ["distributed-global-dashboard"],
    queryFn: () => fetchGlobalDashboard(token),
    enabled: Boolean(token),
    refetchInterval: (q) => {
      const running = q.state.data?.workloads?.running ?? 0;
      return resolveInfraRefetchInterval({ active: running > 0 });
    },
  });
  const regionsQ = useQuery({
    queryKey: ["distributed-regions"],
    queryFn: () => fetchRegions(token),
    enabled: Boolean(token),
    refetchInterval: () => resolveInfraRefetchInterval(),
  });
  const clustersQ = useQuery({
    queryKey: ["distributed-clusters"],
    queryFn: () => fetchClusters(token),
    enabled: Boolean(token),
    refetchInterval: () => resolveInfraRefetchInterval(),
  });

  const regions = regionsQ.data?.items ?? dashQ.data?.regions?.items ?? [];
  const clusters = clustersQ.data?.items ?? dashQ.data?.cluster_items ?? [];
  const grouped = useMemo(() => groupClustersByRegion(regions, clusters), [regions, clusters]);

  const projectScopes = useMemo(
    () => clusterProjectScopes(clusters, accessibleScopes, tenantId),
    [clusters, accessibleScopes, tenantId],
  );

  const runningQ = useQuery({
    queryKey: ["infra-running-by-project", projectScopes],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        projectScopes.map(async ({ tenant, project }) => {
          const page = await fetchRunsPage(tenant, project, token, { limit: 50 });
          counts[project] = page.items.filter((run) => String(run.status || "").toUpperCase() === "RUNNING").length;
        }),
      );
      return counts;
    },
    enabled: Boolean(token && projectScopes.length > 0),
    refetchInterval: (q) => {
      const total = Object.values(q.state.data ?? {}).reduce((sum, count) => sum + count, 0);
      return resolveInfraRefetchInterval({ active: total > 0 });
    },
  });

  const runningCounts = useMemo(
    () => buildRunningCounts(clusters, runningQ.data ?? {}),
    [clusters, runningQ.data],
  );

  const healthyClusters = countHealthyClusters(clusters);
  const globalRunning =
    dashQ.data?.workloads?.running ??
    Object.values(runningQ.data ?? {}).reduce((sum, count) => sum + count, 0);
  const globalQueued = dashQ.data?.scheduler?.queue_depth?.total ?? dashQ.data?.workloads?.queued ?? 0;

  const regionFilterOptions = useMemo(
    () => [
      { value: "all", label: "All regions" },
      ...regions.map((r) => ({ value: r.region_id, label: r.name })),
    ],
    [regions],
  );

  const visibleRegions = useMemo(() => {
    return regions.filter((region) => {
      const entry = grouped.get(region.region_id);
      const regionClusters = entry?.clusters ?? [];
      const health = regionDisplayHealth(region, regionClusters);

      if (regionFilter !== "all" && region.region_id !== regionFilter) return false;
      if (!showEmptyRegions && regionClusters.length === 0) return false;
      if (!matchesHealthFilter(health, healthFilter)) return false;
      if (!matchesSearch(search, region, regionClusters)) return false;
      return true;
    });
  }, [regions, grouped, regionFilter, showEmptyRegions, healthFilter, search]);

  const isLoading = dashQ.isLoading || regionsQ.isLoading || clustersQ.isLoading;
  const error = dashQ.error || regionsQ.error || clustersQ.error;
  const dashEnabled = dashQ.data?.enabled !== false;

  useEffect(() => {
    if (expandedRegions.size > 0 || clusters.length === 0) return;
    setExpandedRegions(new Set(clusters.map((c) => c.region_id)));
  }, [clusters, expandedRegions.size]);

  const toggleRegion = (regionId: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Server} accent="zinc" title="Infrastructure" />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DetailTabList accent="zinc" tabs={[...INFRA_TABS]} />
        <PageScrollBody>
          <TabsContent value="clusters" className="mt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading infrastructure…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{formatApiClientError(error)}</p>
        ) : !dashEnabled && regions.length === 0 && clusters.length === 0 ? (
          <MlopsEmptyState
            icon={Server}
            title="Distributed infrastructure disabled"
            description="Enable ML_AIR_MULTI_REGION or ML_AIR_MULTI_CLUSTER and run mlair seed."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-5">
              <SummaryCard label="Regions" value={regions.length} sub={`${regions.length} registered`} />
              <SummaryCard label="Clusters" value={clusters.length} sub={`${clusters.length} registered`} />
              <SummaryCard
                label="Healthy clusters"
                value={`${healthyClusters} / ${clusters.length}`}
                sub={`${healthyClusters} healthy`}
              />
              <SummaryCard label="Running runs" value={globalRunning} sub="across clusters" />
              <SummaryCard label="Queued runs" value={globalQueued} sub="scheduler queue" />
            </div>

            <PageToolbar className="flex flex-wrap items-center gap-2 px-0">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search regions or clusters"
                  className="h-8 pl-8 text-xs"
                  aria-label="Search regions or clusters"
                />
              </div>
              <SelectDropdown
                value={healthFilter}
                onChange={setHealthFilter}
                options={HEALTH_FILTER_OPTIONS}
                className="w-[140px]"
                buttonClassName="h-8 text-xs"
                aria-label="Health filter"
              />
              <SelectDropdown
                value={regionFilter}
                onChange={setRegionFilter}
                options={regionFilterOptions}
                className="min-w-[140px]"
                buttonClassName="h-8 text-xs"
                aria-label="Region filter"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={showEmptyRegions} onCheckedChange={setShowEmptyRegions} aria-label="Show empty regions" />
                Show empty regions
              </label>
            </PageToolbar>

            <section className="panel-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Region / Cluster</th>
                      <th className="px-3 py-2 font-medium">Clusters</th>
                      <th className="px-3 py-2 font-medium">Health</th>
                      <th className="px-3 py-2 font-medium">Running</th>
                      <th className="px-3 py-2 font-medium">Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRegions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                          No regions match the current filters.
                        </td>
                      </tr>
                    ) : (
                      visibleRegions.map((region) => {
                        const regionClusters = grouped.get(region.region_id)?.clusters ?? [];
                        const health = regionDisplayHealth(region, regionClusters);
                        const expanded = expandedRegions.has(region.region_id);
                        return (
                          <RegionRows
                            key={region.region_id}
                            region={region}
                            clusters={regionClusters}
                            health={health}
                            expanded={expanded}
                            onToggle={() => toggleRegion(region.region_id)}
                            onSelectCluster={setSelectedClusterId}
                            healthFilter={healthFilter}
                            search={search}
                            regionRunning={runningCounts.byRegion.get(region.region_id) ?? 0}
                            clusterRunning={runningCounts.byCluster}
                          />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
          </TabsContent>
          <TabsContent value="federation" className="mt-0">
            <FederationAdminPanel />
          </TabsContent>
          <TabsContent value="edge" className="mt-0">
            <EdgeNodesPanel />
          </TabsContent>
          <TabsContent value="dr" className="mt-0">
            <DrSnapshotsPanel />
          </TabsContent>
        </PageScrollBody>
      </Tabs>

      <ClusterDetailDrawer
        clusterId={selectedClusterId}
        open={Boolean(selectedClusterId)}
        onOpenChange={(open) => {
          if (!open) setSelectedClusterId(null);
        }}
        globalRunning={globalRunning}
        globalQueued={globalQueued}
        clusterRunning={
          selectedClusterId ? runningCounts.byCluster.get(selectedClusterId) : undefined
        }
      />
    </div>
  );
}

function RegionRows({
  region,
  clusters,
  health,
  expanded,
  onToggle,
  onSelectCluster,
  healthFilter,
  search,
  regionRunning,
  clusterRunning,
}: {
  region: Region;
  clusters: Cluster[];
  health: RegionHealthStatus;
  expanded: boolean;
  onToggle: () => void;
  onSelectCluster: (id: string) => void;
  healthFilter: string;
  search: string;
  regionRunning: number;
  clusterRunning: Map<string, number>;
}) {
  const clusterLabel =
    clusters.length === 1 ? "1 cluster" : clusters.length === 0 ? "0 clusters" : `${clusters.length} clusters`;

  const regionHeartbeat =
    clusters.length > 0
      ? clusters.reduce<string | null>((latest, c) => {
          if (!c.last_heartbeat_at) return latest;
          if (!latest) return c.last_heartbeat_at;
          return Date.parse(c.last_heartbeat_at) > Date.parse(latest) ? c.last_heartbeat_at : latest;
        }, null)
      : null;

  const visibleClusters = clusters.filter((cluster) => {
    const clusterHealth = resolveClusterHealth(cluster.health_status, cluster.last_heartbeat_at);
    if (!matchesHealthFilter(clusterHealth, healthFilter)) return false;
    const q = search.trim().toLowerCase();
    if (q && !cluster.name.toLowerCase().includes(q) && !region.name.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <tr className="border-b border-border">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 text-left font-medium hover:text-primary"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span>
              {region.name}
              <span className="ml-1.5 font-normal text-muted-foreground">({region.code})</span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2 tabular-nums text-muted-foreground">{clusterLabel}</td>
        <td className="px-3 py-2">
          <HealthIndicator health={health} heartbeatAt={regionHeartbeat} />
        </td>
        <td className="px-3 py-2 tabular-nums text-muted-foreground">
          {formatInfraRunningCount(clusters.length, regionRunning)}
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          <CapacityCell parts={getRegionCapacityParts(clusters)} />
        </td>
      </tr>
      {expanded && clusters.length === 0 ? (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={5} className="px-3 py-2 pl-10 text-muted-foreground">
            No clusters in this region.
          </td>
        </tr>
      ) : null}
      {expanded
        ? visibleClusters.map((cluster) => {
            const clusterHealth = resolveClusterHealth(cluster.health_status, cluster.last_heartbeat_at);
            return (
              <tr key={cluster.cluster_id} className="border-b border-border bg-muted/20 last:border-0">
                <td className="px-3 py-2 pl-10">
                  <button
                    type="button"
                    onClick={() => onSelectCluster(cluster.cluster_id)}
                    className="text-left font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {cluster.name}
                  </button>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Heartbeat {formatHeartbeatAgo(cluster.last_heartbeat_at)}
                  </p>
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">
                  <HealthIndicator
                    health={clusterHealth}
                    heartbeatAt={cluster.last_heartbeat_at}
                    backendStatus={cluster.health_status}
                  />
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {formatInfraRunningCount(1, clusterRunning.get(cluster.cluster_id) ?? 0)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <CapacityCell parts={getCapacityParts(cluster.capacity)} />
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}
