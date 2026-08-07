"use client";

import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";

import { MlopsEmptyState, ResourcePageHeader } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { fetchClusters, fetchRegions } from "@/lib/distributed-api";
import { formatApiClientError } from "@/lib/utils";

export default function ClustersPage() {
  const { token } = useAppContext();
  const regionsQ = useQuery({ queryKey: ["distributed-regions"], queryFn: () => fetchRegions(token), enabled: Boolean(token) });
  const clustersQ = useQuery({ queryKey: ["distributed-clusters"], queryFn: () => fetchClusters(token), enabled: Boolean(token) });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Server} accent="violet" title="Clusters & Regions" />
      <div className="min-h-0 flex-1 overflow-y-auto p-6 grid gap-6 lg:grid-cols-2">
        {regionsQ.isError || clustersQ.isError ? (
          <p className="text-sm text-destructive col-span-2">
            {formatApiClientError(regionsQ.error || clustersQ.error)}
          </p>
        ) : (
          <>
            <section className="rounded-lg border border-border/60 p-4 space-y-2">
              <h2 className="text-sm font-semibold">Regions</h2>
              {(regionsQ.data?.items || []).length === 0 ? (
                <MlopsEmptyState icon={Server} title="No regions" description="Bật ML_AIR_MULTI_REGION=1 và chạy migration." />
              ) : (
                <ul className="text-xs space-y-1">
                  {(regionsQ.data?.items || []).map((r) => (
                    <li key={r.region_id} className="flex justify-between py-1 border-b border-border/40">
                      <span>{r.name}</span>
                      <span className="text-muted-foreground">{r.health_status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-lg border border-border/60 p-4 space-y-2">
              <h2 className="text-sm font-semibold">Clusters</h2>
              <ul className="text-xs space-y-1">
                {(clustersQ.data?.items || []).map((c) => (
                  <li key={c.cluster_id} className="py-2 border-b border-border/40">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-muted-foreground">{c.api_endpoint} · {c.health_status}</p>
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
