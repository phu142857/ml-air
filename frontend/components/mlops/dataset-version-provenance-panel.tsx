"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { fetchDatasetVersionProvenance, type DatasetVersionItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatDateTimeCompact } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";

type Props = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  token: string;
  versions: DatasetVersionItem[];
  onOpenAccumulation?: () => void;
};

export function DatasetVersionProvenancePanel({ tenantId, projectId, datasetId, token, versions, onOpenAccumulation }: Props) {
  const [versionId, setVersionId] = useState("");

  const options = versions.map((v) => ({
    value: v.version_id,
    label: `${formatVersionLabel(v.version)} · ${v.record_count ?? 0} rows`,
  }));

  const provQuery = useQuery({
    queryKey: mlairKeys.datasets.versionProvenance(tenantId, projectId, datasetId, versionId),
    queryFn: () => fetchDatasetVersionProvenance(tenantId, projectId, datasetId, versionId, token),
    enabled: Boolean(versionId && token),
  });

  if (!versions.length) return null;

  return (
    <div className="panel-surface p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold text-foreground">Trace version origin</span>
      </div>
      <label className="text-xs text-muted-foreground">
        Version
        <SelectDropdown
          value={versionId}
          onChange={setVersionId}
          options={[{ value: "", label: "Select version…" }, ...options]}
          className="mt-1 min-w-[14rem]"
          buttonClassName="panel-surface px-2 py-1.5 text-xs"
          aria-label="Version for provenance"
        />
      </label>
      {versionId && provQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading provenance…</p>
      ) : null}
      {versionId && provQuery.error ? (
        <p className="mt-3 text-xs text-[color:var(--status-failed-fg)]">
          {(provQuery.error as Error).message || "Provenance unavailable"}
        </p>
      ) : null}
      {versionId && provQuery.data ? (
        <div className="mt-3 space-y-2 text-xs">
          <div className="inset-surface p-2">
            <span className="font-semibold text-foreground">Snapshot</span>
            <div className="text-muted-foreground">
              {formatVersionLabel(provQuery.data.version.version)} · {provQuery.data.version.record_count ?? 0} rows ·{" "}
              {formatDateTimeCompact(provQuery.data.version.created_at)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {provQuery.data.version.checksum || "no checksum"}
            </div>
          </div>
          <div className="inset-surface p-2">
            <span className="font-semibold text-foreground">Materialization</span>
            <div className="text-muted-foreground">
              {provQuery.data.materialized_from_buffer ? "From accumulation buffer" : "Direct import / manual"}
            </div>
            {provQuery.data.materialized_from_buffer && onOpenAccumulation ? (
              <button
                type="button"
                className="mt-1 text-primary underline"
                onClick={onOpenAccumulation}
              >
                View buffer window →
              </button>
            ) : null}
            {provQuery.data.accumulation ? (
              <div className="text-muted-foreground">
                Strategy {provQuery.data.accumulation.accumulation_strategy} · threshold{" "}
                {provQuery.data.accumulation.target_threshold} · buffer size{" "}
                {provQuery.data.accumulation.current_size}
              </div>
            ) : null}
          </div>
          {provQuery.data.producing_runs.length ? (
            <div className="inset-surface p-2">
              <span className="font-semibold text-foreground">Producing runs</span>
              <ul className="mt-1 space-y-1">
                {provQuery.data.producing_runs.map((r) => (
                  <li key={`${r.run_id}:${r.task_id}`}>
                    <Link href={`/runs/${r.run_id}`} className="font-mono text-primary underline dark:text-primary">
                      {r.run_id}
                    </Link>
                    <span className="ml-2 text-muted-foreground">task {r.task_id.slice(0, 8)}…</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">No lineage edge recorded this version as output yet.</p>
          )}
          {provQuery.data.input_versions.length ? (
            <div className="inset-surface p-2">
              <span className="font-semibold text-foreground">Input versions</span>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {provQuery.data.input_versions.map((v) => (
                  <li key={v.version_id}>
                    {v.dataset_name || "dataset"} {formatVersionLabel(v.version)} ({v.record_count} rows)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
