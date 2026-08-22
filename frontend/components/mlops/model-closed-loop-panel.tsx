"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, RefreshCw, Activity, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import {
  evaluateClosedLoop,
  fetchClosedLoopEvents,
  fetchClosedLoopPolicy,
  fetchProductionMetricsPage,
  fetchSloRules,
  ingestProductionMetrics,
  replaceSloRules,
  updateClosedLoopPolicy,
  type ClosedLoopEventItem,
  type ClosedLoopPolicy,
  type ProductionMetricItem,
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

const metricColumns: DataTableColumn<ProductionMetricItem>[] = [
  { id: "key", header: "Metric", width: 140, cell: (r) => <span className="font-mono text-xs">{r.metric_key}</span> },
  { id: "value", header: "Value", width: 100, cell: (r) => <span className="tabular-nums text-sm">{r.value}</span> },
  {
    id: "at",
    header: "Recorded",
    width: 160,
    cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTimeCompact(r.recorded_at)}</span>,
  },
];

const eventColumns: DataTableColumn<ClosedLoopEventItem>[] = [
  { id: "type", header: "Type", width: 140, cell: (r) => <span className="text-sm">{r.event_type}</span> },
  { id: "sev", header: "Severity", width: 100, cell: (r) => <span className="text-xs">{r.severity}</span> },
  {
    id: "at",
    header: "Time",
    width: 160,
    cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTimeCompact(r.created_at)}</span>,
  },
];

type Props = { modelId: string };

export function ModelClosedLoopPanel({ modelId }: Props) {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = useRealtimeQueryPolling();
  const [accuracy, setAccuracy] = useState("0.92");
  const [latency, setLatency] = useState("120");
  const [sloAccuracyMin, setSloAccuracyMin] = useState("0.85");

  const policyQuery = useQuery({
    queryKey: mlairKeys.models.closedLoopPolicy(tenantId, projectId, modelId),
    queryFn: () => fetchClosedLoopPolicy(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const metricsQuery = useQuery({
    queryKey: mlairKeys.models.productionMetrics(tenantId, projectId, modelId),
    queryFn: () => fetchProductionMetricsPage(tenantId, projectId, modelId, token, { limit: 30 }),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const eventsQuery = useQuery({
    queryKey: mlairKeys.models.closedLoopEvents(tenantId, projectId, modelId),
    queryFn: () => fetchClosedLoopEvents(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const sloQuery = useQuery({
    queryKey: mlairKeys.models.sloRules(tenantId, projectId, modelId),
    queryFn: () => fetchSloRules(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const [policyDraft, setPolicyDraft] = useState<ClosedLoopPolicy | undefined>(policyQuery.data);

  useEffect(() => {
    if (policyQuery.data) setPolicyDraft(policyQuery.data);
  }, [policyQuery.data]);

  const savePolicyMutation = useMutation({
    mutationFn: () =>
      updateClosedLoopPolicy(tenantId, projectId, modelId, token, {
        monitoring_enabled: policyDraft?.monitoring_enabled ?? true,
        auto_retrain_on_breach: policyDraft?.auto_retrain_on_breach ?? false,
        auto_promote_on_eval_pass: policyDraft?.auto_promote_on_eval_pass ?? false,
        auto_rollback_on_breach: policyDraft?.auto_rollback_on_breach ?? false,
        drift_psi_threshold: policyDraft?.drift_psi_threshold ?? 0.2,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.closedLoopPolicy(tenantId, projectId, modelId) });
      toastSuccess("Closed-loop policy saved");
    },
    onError: (e) => toastError("Save failed", formatApiClientError(e)),
  });

  const ingestMutation = useMutation({
    mutationFn: () =>
      ingestProductionMetrics(tenantId, projectId, modelId, token, {
        samples: [
          { metric_key: "accuracy", value: Number(accuracy) },
          { metric_key: "latency_ms", value: Number(latency) },
        ],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.productionMetrics(tenantId, projectId, modelId), exact: false });
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.closedLoopEvents(tenantId, projectId, modelId) });
      toastSuccess("Metrics ingested");
    },
    onError: (e) => toastError("Ingest failed", formatApiClientError(e)),
  });

  const sloMutation = useMutation({
    mutationFn: () =>
      replaceSloRules(tenantId, projectId, modelId, token, {
        items: [{ metric_key: "accuracy", operator: "gte", threshold: Number(sloAccuracyMin), severity: "critical" }],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.sloRules(tenantId, projectId, modelId) });
      toastSuccess("SLO rules saved");
    },
    onError: (e) => toastError("SLO save failed", formatApiClientError(e)),
  });

  const evalMutation = useMutation({
    mutationFn: () => evaluateClosedLoop(tenantId, projectId, modelId, token),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.closedLoopEvents(tenantId, projectId, modelId) });
      toastSuccess("Closed-loop evaluated", `${out.actions?.length ?? 0} action(s)`);
    },
    onError: (e) => toastError("Evaluate failed", formatApiClientError(e)),
  });

  if (policyQuery.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">Closed-loop policy</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["monitoring_enabled", "Monitoring enabled"],
              ["auto_retrain_on_breach", "Auto retrain on breach"],
              ["auto_promote_on_eval_pass", "Auto promote challenger on eval pass"],
              ["auto_rollback_on_breach", "Auto rollback on breach"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <Label>{label}</Label>
              <Switch
                checked={Boolean(policyDraft?.[key])}
                onCheckedChange={(v) => setPolicyDraft((d) => (d ? { ...d, [key]: v } : d))}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label>Drift PSI threshold</Label>
          <Input
            value={String(policyDraft?.drift_psi_threshold ?? 0.2)}
            onChange={(e) =>
              setPolicyDraft((d) =>
                d ? { ...d, drift_psi_threshold: Number(e.target.value) } : d,
              )
            }
          />
        </div>
        <Button size="sm" onClick={() => savePolicyMutation.mutate()} disabled={savePolicyMutation.isPending}>
          Save policy
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">Ingest production metrics</h3>
        <div className="grid gap-3 sm:grid-cols-2 max-w-md">
          <div className="space-y-1.5">
            <Label>accuracy</Label>
            <Input value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>latency_ms</Label>
            <Input value={latency} onChange={(e) => setLatency(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => ingestMutation.mutate()} disabled={ingestMutation.isPending}>
            <Play className="mr-2 size-4" />
            Ingest
          </Button>
          <Button size="sm" variant="outline" onClick={() => evalMutation.mutate()} disabled={evalMutation.isPending}>
            <RefreshCw className="mr-2 size-4" />
            Evaluate
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">SLO rules</h3>
        <div className="flex flex-wrap items-end gap-2 max-w-md">
          <div className="space-y-1.5 flex-1">
            <Label>accuracy min</Label>
            <Input value={sloAccuracyMin} onChange={(e) => setSloAccuracyMin(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={() => sloMutation.mutate()} disabled={sloMutation.isPending}>
            Save SLO
          </Button>
        </div>
        {sloQuery.data?.items?.length ? (
          <p className="text-xs text-muted-foreground">
            Active: {sloQuery.data.items.map((r) => `${r.metric_key} ${r.operator} ${r.threshold}`).join(", ")}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Recent metrics</h3>
        {(metricsQuery.data?.items?.length ?? 0) > 0 ? (
          <MlopsDataTable columns={metricColumns} data={metricsQuery.data?.items ?? []} keyExtractor={(r) => r.sample_id} />
        ) : (
          <MlopsEmptyState icon={Activity} title="No production metrics" description="Ingest metrics to start monitoring." />
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Closed-loop events</h3>
        {(eventsQuery.data?.items?.length ?? 0) > 0 ? (
          <MlopsDataTable columns={eventColumns} data={eventsQuery.data?.items ?? []} keyExtractor={(r) => r.event_id} />
        ) : (
          <MlopsEmptyState icon={Radio} title="No events" description="Drift/SLO breaches will appear here." />
        )}
      </div>
    </div>
  );
}
