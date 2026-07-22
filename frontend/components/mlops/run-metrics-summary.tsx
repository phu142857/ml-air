"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RunMetricSummary, RunTracking } from "@/lib/api";

type Props = {
  tracking?: RunTracking | null;
  onExport?: (format: "csv" | "jsonl") => void;
  exporting?: boolean;
};

function formatMetricValue(value: number): string {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(2);
  }
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function pickHighlightMetrics(summary: Record<string, RunMetricSummary>): Array<[string, RunMetricSummary]> {
  const priority = ["loss", "train_loss", "val_loss", "accuracy", "acc", "map", "map50"];
  const entries = Object.entries(summary);
  const ranked = [...entries].sort((a, b) => {
    const ai = priority.findIndex((key) => a[0].toLowerCase().includes(key));
    const bi = priority.findIndex((key) => b[0].toLowerCase().includes(key));
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a[0].localeCompare(b[0]);
  });
  return ranked.slice(0, 4);
}

export function RunMetricsSummary({ tracking, onExport, exporting }: Props) {
  const summary = tracking?.metrics_summary ?? {};
  const highlights = pickHighlightMetrics(summary);
  const metricCount = tracking?.metrics?.length ?? 0;

  if (!metricCount && highlights.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Live summary</p>
          <p className="text-xs text-muted-foreground">
            {metricCount} logged point{metricCount === 1 ? "" : "s"}
            {highlights[0] ? ` · latest step ${highlights[0][1].last_step}` : ""}
          </p>
        </div>
        {onExport ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={exporting} onClick={() => onExport("csv")}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={exporting} onClick={() => onExport("jsonl")}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              JSONL
            </Button>
          </div>
        ) : null}
      </div>
      {highlights.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {highlights.map(([key, item]) => (
            <div key={key} className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <p className="truncate font-mono text-[11px] text-muted-foreground">{key}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatMetricValue(item.latest)}</p>
              <p className="text-[11px] text-muted-foreground">
                best {formatMetricValue(item.best)} · {item.steps} step{item.steps === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
