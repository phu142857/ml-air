"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { fetchDatasetVersionQuality, type DatasetVersionItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatVersionLabel } from "@/lib/version-label";

type Props = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  token: string;
  version: DatasetVersionItem;
};

function barWidth(count: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(4, Math.round((count / total) * 100))}%`;
}

export function DatasetQualityPanel({ tenantId, projectId, datasetId, token, version }: Props) {
  const qualityQuery = useQuery({
    queryKey: mlairKeys.datasets.versionQuality(tenantId, projectId, datasetId, version.version_id),
    queryFn: () => fetchDatasetVersionQuality(tenantId, projectId, datasetId, version.version_id, token),
    enabled: Boolean(token && version.version_id),
  });

  const quality = qualityQuery.data;
  const distribution = quality?.label_distribution ?? {};
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="panel-surface p-3">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Data quality</p>
          <p className="text-xs text-muted-foreground">
            {formatVersionLabel(version.version)} · {quality?.sample_count ?? version.record_count ?? 0} samples · score{" "}
            {quality?.quality_score ?? version.quality_score ?? 0}
          </p>
        </div>
      </div>

      {qualityQuery.isLoading ? <p className="text-xs text-muted-foreground">Loading profile…</p> : null}
      {qualityQuery.error ? (
        <p className="text-xs text-[color:var(--status-failed-fg)]">{(qualityQuery.error as Error).message}</p>
      ) : null}

      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.slice(0, 8).map(([label, count]) => (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-mono text-foreground/90">{label}</span>
                <span className="text-muted-foreground">
                  {count} ({total > 0 ? ((count / total) * 100).toFixed(1) : "0"}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-background/80">
                <div className="h-2 rounded-full bg-primary/70" style={{ width: barWidth(count, total) }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No label distribution stored for this version. Add `label_distribution` or `labels` in version `details` when materializing.
        </p>
      )}

      {quality?.null_rate != null ? (
        <p className="mt-3 text-xs text-muted-foreground">Null rate: {(quality.null_rate * 100).toFixed(2)}%</p>
      ) : null}
    </div>
  );
}
