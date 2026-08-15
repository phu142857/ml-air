"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Server } from "lucide-react";

import { DetailTabBar } from "@/components/mlops/layout";
import { StatusBadge } from "@/components/mlops/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAppContext } from "@/lib/app-context";
import { fetchCluster, fetchRegions, type Cluster } from "@/lib/distributed-api";
import {
  clusterHealthTooltip,
  formatHeartbeatAgo,
  formatResourceDetail,
  healthLabel,
  parseCpuCapacity,
  parseGpuCapacity,
  parseMemoryCapacity,
  resolveClusterHealth,
} from "@/lib/infrastructure-view";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const DRAWER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "nodes", label: "Nodes" },
  { id: "events", label: "Events" },
  { id: "settings", label: "Settings" },
] as const;

type DrawerTab = (typeof DRAWER_TABS)[number]["id"];

type ClusterDetailDrawerProps = {
  clusterId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  globalRunning?: number;
  globalQueued?: number;
};

export function ClusterDetailDrawer({
  clusterId,
  open,
  onOpenChange,
  globalRunning,
  globalQueued,
}: ClusterDetailDrawerProps) {
  const { token } = useAppContext();
  const [tab, setTab] = useState<DrawerTab>("overview");

  const clusterQ = useQuery({
    queryKey: ["distributed-cluster", clusterId],
    queryFn: () => fetchCluster(token, clusterId!),
    enabled: Boolean(token && clusterId && open),
  });

  const regionsQ = useQuery({
    queryKey: ["distributed-regions"],
    queryFn: () => fetchRegions(token),
    enabled: Boolean(token && open),
  });

  const cluster = clusterQ.data;
  const region = regionsQ.data?.items.find((r) => r.region_id === cluster?.region_id);
  const health = cluster ? resolveClusterHealth(cluster.health_status, cluster.last_heartbeat_at) : "unknown";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 border-border/60 p-0 sm:max-w-xl">
        {clusterQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading cluster…</div>
        ) : clusterQ.isError || !cluster ? (
          <div className="p-6 text-sm text-destructive">
            {formatApiClientError(clusterQ.error ?? "Cluster not found")}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
              <div className="flex items-start gap-2 pr-8">
                <Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">{cluster.name}</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <ClusterStatusBadge cluster={cluster} health={health} />
                    <span className="text-[11px] text-muted-foreground">
                      Heartbeat {formatHeartbeatAgo(cluster.last_heartbeat_at)}
                    </span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as DrawerTab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DetailTabBar value={tab} onValueChange={(v) => setTab(v as DrawerTab)} tabs={[...DRAWER_TABS]} />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <DrawerSection title="General">
                    <DrawerGrid
                      items={[
                        { label: "Region", value: region ? `${region.name} (${region.code})` : cluster.region_id },
                        {
                          label: "Endpoint",
                          value: (
                            <a
                              href={cluster.api_endpoint}
                              className="break-all font-mono text-[11px] text-primary hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {cluster.api_endpoint}
                            </a>
                          ),
                        },
                        { label: "Cluster ID", value: <span className="font-mono text-[11px]">{cluster.cluster_id}</span> },
                        {
                          label: "Agent version",
                          value: agentVersionLabel(cluster),
                        },
                        {
                          label: "Registered at",
                          value: cluster.created_at ? formatDateTimeCompact(cluster.created_at) : "—",
                        },
                      ]}
                    />
                  </DrawerSection>

                  <DrawerSection title="Status">
                    <DrawerGrid
                      items={[
                        { label: "Health", value: <ClusterStatusBadge cluster={cluster} health={health} /> },
                        { label: "Last heartbeat", value: formatHeartbeatAgo(cluster.last_heartbeat_at) },
                        { label: "Uptime", value: "—" },
                      ]}
                    />
                  </DrawerSection>

                  <DrawerSection title="Capacity">
                    <DrawerGrid
                      items={[
                        {
                          label: "GPU",
                          value: formatResourceDetail(cluster.capacity, parseGpuCapacity, [
                            "gpu_available",
                            "gpu_total",
                            "gpu",
                          ], "GPU"),
                        },
                        {
                          label: "CPU",
                          value: formatResourceDetail(cluster.capacity, parseCpuCapacity, [
                            "cpu_cores_available",
                            "cpu_total",
                            "cpu",
                          ], "cores"),
                        },
                        {
                          label: "Memory",
                          value: formatResourceDetail(cluster.capacity, parseMemoryCapacity, [
                            "memory_gb_available",
                            "memory_total_gb",
                            "memory_gb",
                          ], "GB"),
                        },
                      ]}
                    />
                  </DrawerSection>

                  <DrawerSection title="Workloads">
                    <DrawerGrid
                      items={[
                        {
                          label: "Running runs",
                          value: "—",
                          hint: globalRunning !== undefined ? `${globalRunning} across all clusters` : undefined,
                        },
                        {
                          label: "Queued runs",
                          value: "—",
                          hint: globalQueued !== undefined ? `${globalQueued} scheduler queue` : undefined,
                        },
                      ]}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Per-cluster workload attribution is not available yet.
                    </p>
                  </DrawerSection>

                  <DrawerSection title="Quick actions">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/runs">
                          View Runs
                          <ExternalLink className="ml-1.5 h-3 w-3" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        View Nodes
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        View Events
                      </Button>
                    </div>
                  </DrawerSection>
                </TabsContent>

                <TabsContent value="nodes" className="mt-0">
                  <PlaceholderTab message="Node inventory is not available for this cluster yet." />
                </TabsContent>
                <TabsContent value="events" className="mt-0">
                  <PlaceholderTab message="Cluster events stream is not available yet." />
                </TabsContent>
                <TabsContent value="settings" className="mt-0">
                  <PlaceholderTab message="Cluster settings are managed through the control plane API." />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}


function ClusterStatusBadge({ cluster, health }: { cluster: Cluster; health: ReturnType<typeof resolveClusterHealth> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <StatusBadge
            status={
              health === "healthy"
                ? "success"
                : health === "offline"
                  ? "failed"
                  : health === "stale"
                    ? "warning"
                    : "info"
            }
            label={healthLabel(health)}
            size="sm"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line">
        {clusterHealthTooltip(health, cluster.last_heartbeat_at, cluster.health_status)}
      </TooltipContent>
    </Tooltip>
  );
}

function agentVersionLabel(cluster: Cluster): string {
  const labels = cluster.labels ?? {};
  const version = labels.agent_version ?? labels.agentVersion ?? labels.version;
  return version ? String(version) : "—";
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function DrawerGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode; hint?: string }[];
}) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="inset-surface px-2.5 py-2">
          <dt className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="text-sm text-foreground">{item.value}</dd>
          {item.hint ? <dd className="mt-0.5 text-[10px] text-muted-foreground">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function PlaceholderTab({ message }: { message: string }) {
  return (
    <div className="inset-surface px-3 py-6 text-center text-sm text-muted-foreground">{message}</div>
  );
}
