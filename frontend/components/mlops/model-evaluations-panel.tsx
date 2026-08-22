"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { StatusBadge } from "@/components/mlops/status-badge";
import { useModelEvaluations } from "@/hooks/use-model-evaluations";
import { evaluateModelVersion, type ModelEvaluationItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";
import { toastError, toastSuccess } from "@/lib/toast-actions";

const columns: DataTableColumn<ModelEvaluationItem>[] = [
  {
    id: "version",
    header: "Version",
    width: 90,
    getSortValue: (r) => r.version,
    cell: (r) => <span className="font-mono text-xs">{formatVersionLabel(r.version)}</span>,
  },
  {
    id: "benchmark",
    header: "Benchmark",
    width: 120,
    getSortValue: (r) => r.benchmark_name,
    cell: (r) => <span className="text-sm">{r.benchmark_name}</span>,
  },
  {
    id: "status",
    header: "Status",
    width: 100,
    getSortValue: (r) => r.status,
    cell: (r) => <StatusBadge value={r.status} />,
  },
  {
    id: "metrics",
    header: "Metrics",
    width: 220,
    wrap: true,
    cell: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {Object.entries(r.metrics || {})
          .slice(0, 3)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ") || "—"}
      </span>
    ),
  },
  {
    id: "evaluated_at",
    header: "Evaluated",
    width: 160,
    getSortValue: (r) => r.evaluated_at,
    cell: (r) => (
      <span className="text-xs text-muted-foreground">{formatDateTimeCompact(r.evaluated_at)}</span>
    ),
  },
];

type Props = {
  modelId: string;
  defaultVersion?: number | null;
};

export function ModelEvaluationsPanel({ modelId, defaultVersion }: Props) {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(String(defaultVersion ?? 1));
  const [accuracy, setAccuracy] = useState("0.9");
  const [minGate, setMinGate] = useState("0.85");

  const { items, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useModelEvaluations(
    modelId,
    true,
  );

  const evaluateMutation = useMutation({
    mutationFn: () =>
      evaluateModelVersion(tenantId, projectId, modelId, Number(version), token, {
        metrics: { accuracy: Number(accuracy) },
        gates: { accuracy: { min: Number(minGate) } },
        benchmark_name: "holdout",
        source: "manual",
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.evaluationsInfinite(tenantId, projectId, modelId),
        exact: false,
      });
      toastSuccess(`Evaluation ${result.status}`, result.evaluation_id);
    },
    onError: (e) => toastError("Evaluation failed", formatApiClientError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Run evaluation gate</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eval-version">Version</Label>
            <Input
              id="eval-version"
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-accuracy">accuracy</Label>
            <Input
              id="eval-accuracy"
              value={accuracy}
              onChange={(e) => setAccuracy(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-min">min gate</Label>
            <Input id="eval-min" value={minGate} onChange={(e) => setMinGate(e.target.value)} />
          </div>
        </div>
        <Button
          className="mt-3"
          size="sm"
          onClick={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending}
        >
          {evaluateMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          Evaluate
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <MlopsEmptyState
          icon={ClipboardCheck}
          title="No evaluations yet"
          description="Record a benchmark evaluation to track model quality over versions."
        />
      ) : (
        <>
          <MlopsDataTable columns={columns} data={items} keyExtractor={(r) => r.evaluation_id} />
          {hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Load more
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
