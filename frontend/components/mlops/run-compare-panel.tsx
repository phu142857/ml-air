"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, GitCompare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { compareRunMetrics, type RunCompareItem, type RunItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatRuntimeSeconds } from "@/lib/usage-format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  token: string;
  runs: RunItem[];
};

function regressionClass(count: number): string {
  if (count <= 0) return "border-border/60 bg-background/70";
  return "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)]/40";
}

function formatDelta(value?: number, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value > 0) return `+${Number(value).toFixed(2)}${suffix}`;
  if (value < 0) return `${Number(value).toFixed(2)}${suffix}`;
  return `0${suffix}`;
}

function RunCompareCard({ item }: { item: RunCompareItem }) {
  const regressions = item.regressions ?? [];
  return (
    <div className={`rounded-lg border p-3 ${regressionClass(regressions.length)}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Link href={`/runs/${encodeURIComponent(item.run_id)}`} className="font-mono text-sm text-primary hover:underline">
            {item.run_id}
          </Link>
          <p className="text-xs text-muted-foreground">
            {item.status ?? "—"}
            {item.is_baseline ? " · baseline" : ""}
          </p>
        </div>
        {regressions.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--status-failed-fg)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {regressions.length} regression{regressions.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>Duration: {item.duration_seconds == null ? "—" : formatRuntimeSeconds(item.duration_seconds)}</li>
        <li>CPU: {item.usage?.cpu_seconds ?? "—"}s · GPU: {item.usage?.gpu_seconds ?? "—"}s</li>
        {Object.entries(item.metrics_summary ?? {})
          .slice(0, 3)
          .map(([key, metric]) => (
            <li key={key}>
              {key}: latest {metric.latest} · best {metric.best}
            </li>
          ))}
      </ul>
      {regressions.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-[color:var(--status-failed-fg)]">
          {regressions.map((regression, index) => (
            <li key={`${regression.type}-${regression.key ?? index}`}>
              {regression.type === "metric"
                ? `${regression.key} ${formatDelta(regression.delta)} (${regression.direction})`
                : regression.type === "duration"
                  ? `Duration ${formatDelta(regression.delta, "s")} (${regression.direction})`
                  : `${regression.key} ${formatDelta(regression.delta)} (${regression.direction})`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RunComparePanel({ open, onOpenChange, tenantId, projectId, token, runs }: Props) {
  const [baselineRunId, setBaselineRunId] = useState<string>("");
  const runIds = useMemo(() => runs.map((run) => run.run_id), [runs]);

  const compareQuery = useQuery({
    queryKey: [...mlairKeys.runs.list(tenantId, projectId), "compare", ...runIds, baselineRunId || "auto"],
    queryFn: () =>
      compareRunMetrics(tenantId, projectId, runIds, token, {
        baselineRunId: baselineRunId || undefined,
      }),
    enabled: open && runIds.length >= 2 && Boolean(token),
  });

  const baselineOptions = useMemo(
    () => [
      { value: "", label: "Auto (oldest run)" },
      ...runs.map((run) => ({ value: run.run_id, label: run.run_id })),
    ],
    [runs],
  );

  const effectiveBaseline = compareQuery.data?.baseline_run_id ?? baselineRunId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Compare runs
          </DialogTitle>
          <DialogDescription>
            Highlight slower runs, higher resource usage, and worse metrics against the selected baseline.
          </DialogDescription>
        </DialogHeader>

        <label className="block text-xs text-muted-foreground">
          Baseline run
          <SelectDropdown
            value={baselineRunId}
            onChange={setBaselineRunId}
            options={baselineOptions}
            className="mt-1"
            buttonClassName="panel-surface px-2 py-1.5 text-xs font-mono"
            aria-label="Baseline run"
          />
        </label>

        {compareQuery.isLoading ? <p className="text-sm text-muted-foreground">Comparing runs…</p> : null}
        {compareQuery.error ? (
          <p className="text-sm text-[color:var(--status-failed-fg)]">{(compareQuery.error as Error).message}</p>
        ) : null}

        {compareQuery.data ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Baseline: <span className="font-mono text-foreground">{effectiveBaseline ?? "—"}</span>
            </p>
            <div className="grid gap-3">
              {compareQuery.data.runs.map((item) => (
                <RunCompareCard key={item.run_id} item={item} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
