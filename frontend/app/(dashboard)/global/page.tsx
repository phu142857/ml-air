"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe, Server } from "lucide-react";

import { MlopsEmptyState, ResourcePageHeader } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { fetchGlobalDashboard } from "@/lib/distributed-api";
import { formatApiClientError } from "@/lib/utils";

export default function GlobalPage() {
  const { token } = useAppContext();
  const dashQ = useQuery({
    queryKey: ["distributed-global-dashboard"],
    queryFn: () => fetchGlobalDashboard(token),
    enabled: Boolean(token),
  });

  const dash = dashQ.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Globe} accent="sky" title="Global Control Plane" />
      <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
        {dashQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading global dashboard…</p>
        ) : dashQ.isError ? (
          <p className="text-sm text-destructive">{formatApiClientError(dashQ.error)}</p>
        ) : dash?.enabled === false ? (
          <MlopsEmptyState icon={Globe} title="Global observability tắt" description="Bật ML_AIR_GLOBAL_OBSERVABILITY=1" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Stat label="Regions" value={dash?.regions?.total ?? 0} sub={`${dash?.regions?.healthy ?? 0} healthy`} />
              <Stat label="Clusters" value={dash?.clusters?.total ?? 0} sub={`${dash?.clusters?.healthy ?? 0} healthy`} />
              <Stat label="Queue" value={dash?.scheduler?.queue_depth?.total ?? 0} sub="runs pending" />
              <Stat label="Replication" value={dash?.replication?.synced ?? 0} sub={`${dash?.replication?.pending ?? 0} pending`} />
            </div>
            <section>
              <h2 className="text-sm font-semibold mb-2">Regions</h2>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {(dash?.regions?.items || []).map((r) => (
                  <li key={r.region_id} className="flex justify-between border-b border-border/40 py-1">
                    <span>{r.name} ({r.code})</span>
                    <span>{r.health_status}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-sm font-semibold mb-2">Clusters</h2>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {(dash?.cluster_items || []).map((c) => (
                  <li key={c.cluster_id} className="flex justify-between border-b border-border/40 py-1">
                    <span>{c.name}</span>
                    <span>{c.health_status}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
