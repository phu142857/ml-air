"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { fetchDatasetVersionDiff, type DatasetVersionItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatDateTimeCompact } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";

type Props = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  token: string;
  versions: DatasetVersionItem[];
};

function deltaLabel(value: number, suffix = ""): string {
  if (value > 0) return `+${value}${suffix}`;
  if (value < 0) return `${value}${suffix}`;
  return `0${suffix}`;
}

export function DatasetVersionDiffPanel({ tenantId, projectId, datasetId, token, versions }: Props) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [compare, setCompare] = useState(false);

  const options = versions.map((v) => ({
    value: v.version_id,
    label: `${formatVersionLabel(v.version)} · ${v.record_count ?? 0} rows`,
  }));

  const diffQuery = useQuery({
    queryKey: mlairKeys.datasets.versionDiff(tenantId, projectId, datasetId, fromId, toId),
    queryFn: () => fetchDatasetVersionDiff(tenantId, projectId, datasetId, fromId, toId, token),
    enabled: compare && Boolean(fromId && toId && fromId !== toId && token),
  });

  if (versions.length < 2) return null;

  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GitCompare className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold text-foreground">Compare versions</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          From
          <SelectDropdown
            value={fromId}
            onChange={(v) => {
              setFromId(v);
              setCompare(false);
            }}
            options={[{ value: "", label: "Select…" }, ...options]}
            className="mt-1 min-w-[11rem]"
            buttonClassName="panel-surface px-2 py-1.5 text-xs"
            aria-label="Compare from version"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <SelectDropdown
            value={toId}
            onChange={(v) => {
              setToId(v);
              setCompare(false);
            }}
            options={[{ value: "", label: "Select…" }, ...options]}
            className="mt-1 min-w-[11rem]"
            buttonClassName="panel-surface px-2 py-1.5 text-xs"
            aria-label="Compare to version"
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!fromId || !toId || fromId === toId}
          onClick={() => setCompare(true)}
        >
          Compare
        </Button>
      </div>
      {compare && diffQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Computing diff…</p>
      ) : null}
      {compare && diffQuery.error ? (
        <p className="mt-3 text-xs text-[color:var(--status-failed-fg)]">
          {(diffQuery.error as Error).message || "Diff failed"}
        </p>
      ) : null}
      {compare && diffQuery.data ? (
        <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="mb-1 font-semibold text-foreground">From {formatVersionLabel(diffQuery.data.from.version)}</p>
            <p className="text-muted-foreground">{diffQuery.data.from.record_count} rows</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={diffQuery.data.from.checksum || ""}>
              {diffQuery.data.from.checksum || "—"}
            </p>
            <p className="text-muted-foreground">{formatDateTimeCompact(diffQuery.data.from.created_at)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="mb-1 font-semibold text-foreground">To {formatVersionLabel(diffQuery.data.to.version)}</p>
            <p className="text-muted-foreground">{diffQuery.data.to.record_count} rows</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={diffQuery.data.to.checksum || ""}>
              {diffQuery.data.to.checksum || "—"}
            </p>
            <p className="text-muted-foreground">{formatDateTimeCompact(diffQuery.data.to.created_at)}</p>
          </div>
          <div className="md:col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 font-semibold text-foreground">Delta</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li>Rows: {deltaLabel(diffQuery.data.delta.record_count_delta)}</li>
              <li>Quality: {deltaLabel(diffQuery.data.delta.quality_score_delta)}</li>
              <li>Checksum changed: {diffQuery.data.delta.checksum_changed ? "yes" : "no"}</li>
              <li>Source changed: {diffQuery.data.delta.source_type_changed ? "yes" : "no"}</li>
              {diffQuery.data.delta.tags_added.length ? (
                <li>Tags added: {diffQuery.data.delta.tags_added.join(", ")}</li>
              ) : null}
              {diffQuery.data.delta.tags_removed.length ? (
                <li>Tags removed: {diffQuery.data.delta.tags_removed.join(", ")}</li>
              ) : null}
              <li>External refs: {deltaLabel(diffQuery.data.delta.external_refs_count_delta)}</li>
              {diffQuery.data.drift?.psi != null ? (
                <li className={diffQuery.data.drift.psi > 0.2 ? "text-[color:var(--status-failed-fg)]" : ""}>
                  Label drift PSI: {diffQuery.data.drift.psi.toFixed(4)}
                </li>
              ) : null}
            </ul>
            {diffQuery.data.drift?.label_distribution_delta &&
            Object.keys(diffQuery.data.drift.label_distribution_delta).length > 0 ? (
              <div className="mt-3">
                <p className="mb-1 font-medium text-foreground">Label delta</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {Object.entries(diffQuery.data.drift.label_distribution_delta).map(([label, delta]) => (
                    <li key={label}>
                      {label}: {delta > 0 ? `+${delta}` : delta}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
