"use client";

import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";

import { MlopsEmptyState } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { fetchFederations } from "@/lib/distributed-api";
import { resolveInfraRefetchInterval } from "@/lib/realtime-query-polling";
import { formatApiClientError } from "@/lib/utils";

export function FederationAdminPanel() {
  const { token } = useAppContext();
  const poll = { refetchInterval: resolveInfraRefetchInterval() };

  const query = useQuery({
    queryKey: ["distributed-federations"],
    queryFn: () => fetchFederations(token),
    enabled: Boolean(token?.trim()),
    ...poll,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading federations…</p>;
  if (query.error) return <p className="text-sm text-destructive">{formatApiClientError(query.error)}</p>;

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return (
      <MlopsEmptyState
        icon={Network}
        title="No federations"
        description="Run mlair seed distributed to populate federation tree."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((fed) => (
        <div key={fed.federation_id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">{fed.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{fed.federation_id}</p>
            </div>
            <span className="text-xs text-muted-foreground">{fed.scope}</span>
          </div>
          {fed.parent_federation_id ? (
            <p className="mt-2 text-xs text-muted-foreground">Parent: {fed.parent_federation_id}</p>
          ) : null}
          {(fed.regions?.length ?? 0) > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
              {fed.regions?.map((r) => (
                <li key={`${fed.federation_id}-${r.region_id}`} className="flex justify-between gap-2">
                  <span className="font-mono text-foreground">{r.region_id}</span>
                  <span className="text-muted-foreground">{r.tenant_scope ?? "all tenants"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No attached regions</p>
          )}
        </div>
      ))}
    </div>
  );
}
