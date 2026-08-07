"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "lucide-react";

import { ControlPlaneDisabled } from "@/components/mlops/control-plane/disabled-state";
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/app-context";
import { fetchChargeback, fetchChargebackSnapshots, saveChargebackSnapshot } from "@/lib/control-plane-api";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { useControlPlaneFeatures } from "@/lib/use-control-plane-features";
import { cn, formatApiClientError } from "@/lib/utils";

export default function BillingPage() {
  const { tenantId, projectId, token } = useAppContext();
  const flags = useControlPlaneFeatures();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qc = useQueryClient();

  const chargebackQ = useQuery({
    queryKey: mlairKeys.controlPlane.chargeback(tenantId, projectId),
    queryFn: () => fetchChargeback(tenantId, projectId, token, 30),
    enabled: scopePinned && flags.chargeback,
  });
  const snapshotsQ = useQuery({
    queryKey: mlairKeys.controlPlane.chargebackSnapshots(tenantId, projectId),
    queryFn: () => fetchChargebackSnapshots(tenantId, projectId, token),
    enabled: scopePinned && flags.chargeback,
  });

  const snapshotM = useMutation({
    mutationFn: () => saveChargebackSnapshot(tenantId, projectId, token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.chargebackSnapshots(tenantId, projectId) }),
  });

  if (!flags.chargeback) {
    return <div className="p-6"><ControlPlaneDisabled feature="Chargeback" envVar="ML_AIR_CHARGEBACK" /></div>;
  }

  const report = chargebackQ.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={DollarSign}
        accent="amber"
        title="Billing & Chargeback"
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => chargebackQ.refetch()} disabled={!scopePinned || chargebackQ.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", chargebackQ.isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />
      <div className="shrink-0 page-toolbar">{!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : null}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
        {!scopePinned ? (
          <MlopsEmptyState icon={DollarSign} title="Pin a project" description="Chargeback theo project." />
        ) : chargebackQ.isError ? (
          <p className="text-sm text-destructive">{formatApiClientError(chargebackQ.error)}</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-border/60 p-4">
                <p className="text-xs text-muted-foreground">Total (30d)</p>
                <p className="text-2xl font-semibold">${report?.total_cost_usd?.toFixed(2) ?? "—"}</p>
              </div>
              {report?.categories
                ? Object.entries(report.categories).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border/60 p-4">
                      <p className="text-xs text-muted-foreground capitalize">{k}</p>
                      <p className="text-xl font-semibold">${Number(v).toFixed(2)}</p>
                    </div>
                  ))
                : null}
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Top runs by cost</h2>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => snapshotM.mutate()} disabled={snapshotM.isPending}>
                  Save monthly snapshot
                </Button>
              </div>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {(report?.runs || []).slice(0, 10).map((r) => (
                  <li key={r.run_id} className="flex justify-between border-b border-border/40 py-1">
                    <span className="font-mono">{r.run_id.slice(0, 8)}…</span>
                    <span>${r.cost_usd.toFixed(4)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Snapshots</h2>
              <ul className="text-xs text-muted-foreground space-y-1">
                {(snapshotsQ.data?.items || []).map((s) => (
                  <li key={s.period_key}>{s.period_key} · ${s.payload?.total_cost_usd?.toFixed(2) ?? "—"}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
