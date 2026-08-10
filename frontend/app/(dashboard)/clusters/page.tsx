"use client";

import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";

import { MlopsEmptyState, PageScrollBody, ResourcePageHeader } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { fetchClusters, fetchRegions } from "@/lib/distributed-api";
import { formatApiClientError } from "@/lib/utils";

export default function ClustersPage() {
  const { token } = useAppContext();
  const regionsQ = useQuery({ queryKey: ["distributed-regions"], queryFn: () => fetchRegions(token), enabled: Boolean(token) });
  const clustersQ = useQuery({ queryKey: ["distributed-clusters"], queryFn: () => fetchClusters(token), enabled: Boolean(token) });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Server} accent="zinc" title="Clusters & Regions" />
      <PageScrollBody>
        {regionsQ.isError || clustersQ.isError ? (
          <p className="text-sm text-destructive">{formatApiClientError(regionsQ.error || clustersQ.error)}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel-surface space-y-2 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regions</h2>
              {(regionsQ.data?.items || []).length === 0 ? (
                <MlopsEmptyState icon={Server} title="No regions" description="Enable ML_AIR_MULTI_REGION and run migration." />
              ) : (
                <ul className="space-y-1 text-xs">
                  {(regionsQ.data?.items || []).map((r) => (
                    <li key={r.region_id} className="flex justify-between border-b border-border py-1.5 last:border-0">
                      <span>{r.name}</span>
                      <span className="text-muted-foreground">{r.health_status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel-surface space-y-2 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clusters</h2>
              <ul className="space-y-1 text-xs">
                {(clustersQ.data?.items || []).map((c) => (
                  <li key={c.cluster_id} className="border-b border-border py-2 last:border-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-muted-foreground">{c.api_endpoint} · {c.health_status}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </PageScrollBody>
    </div>
  );
}
