"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "lucide-react";

import { ControlPlaneDisabled } from "@/components/mlops/control-plane/disabled-state";
import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
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
        accent="zinc"
        title="Billing & Chargeback"
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => chargebackQ.refetch()} disabled={!scopePinned || chargebackQ.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", chargebackQ.isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : undefined}
      >
        {!scopePinned ? (
          <MlopsEmptyState icon={DollarSign} title="Pin a project" description="Chargeback is scoped per project." />
        ) : chargebackQ.isError ? (
          <p className="text-sm text-destructive">{formatApiClientError(chargebackQ.error)}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
              <div className="bg-card px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total (30d)</p>
                <p className="text-2xl font-semibold tabular-nums">${report?.total_cost_usd?.toFixed(2) ?? "—"}</p>
              </div>
              {report?.categories
                ? Object.entries(report.categories).map(([k, v]) => (
                    <div key={k} className="bg-card px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground capitalize">{k}</p>
                      <p className="text-xl font-semibold tabular-nums">${Number(v).toFixed(2)}</p>
                    </div>
                  ))
                : null}
            </div>

            <section className="panel-surface space-y-2 p-3">
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

            <section className="panel-surface space-y-2 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Snapshots</h2>
              <ul className="text-xs text-muted-foreground space-y-1">
                {(snapshotsQ.data?.items || []).map((s) => (
                  <li key={s.period_key}>{s.period_key} · ${s.payload?.total_cost_usd?.toFixed(2) ?? "—"}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </PageScrollBody>
    </div>
  );
}
