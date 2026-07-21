"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchModelProvenance } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { formatVersionLabel } from "@/lib/version-label";

type Props = {
  tenantId: string;
  projectId: string;
  modelId: string;
  token: string;
  version?: number | null;
};

export function ModelProvenancePanel({ tenantId, projectId, modelId, token, version }: Props) {
  const [open, setOpen] = useState(false);
  const provQuery = useQuery({
    queryKey: mlairKeys.models.provenance(tenantId, projectId, modelId, version ?? null),
    queryFn: () => fetchModelProvenance(tenantId, projectId, modelId, token, version ?? undefined),
    enabled: open && Boolean(token),
  });

  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold text-foreground">Trace origin</span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show chain"}
        </Button>
      </div>
      {open && provQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading provenance…</p>
      ) : null}
      {open && provQuery.error ? (
        <p className="mt-3 text-xs text-[color:var(--status-failed-fg)]">
          {(provQuery.error as Error).message || "Provenance unavailable"}
        </p>
      ) : null}
      {open && provQuery.data ? (
        <ol className="mt-3 space-y-2 text-xs">
          <li className="rounded-lg border border-border/60 bg-background/60 p-2">
            <span className="font-semibold text-foreground">Model</span>
            <div className="text-muted-foreground">{provQuery.data.model?.name ?? modelId}</div>
          </li>
          {provQuery.data.model_version ? (
            <li className="rounded-lg border border-border/60 bg-background/60 p-2">
              <span className="font-semibold text-foreground">Version</span>
              <div className="text-muted-foreground">
                {formatVersionLabel(provQuery.data.model_version.version)} · {provQuery.data.model_version.stage || "none"}
              </div>
            </li>
          ) : (
            <li className="text-muted-foreground">No registered versions yet.</li>
          )}
          {provQuery.data.run ? (
            <li className="rounded-lg border border-border/60 bg-background/60 p-2">
              <span className="font-semibold text-foreground">Run</span>
              <div>
                <Link
                  href={`/runs/${provQuery.data.run.run_id}`}
                  className="font-mono text-primary underline dark:text-primary"
                >
                  {provQuery.data.run.run_id}
                </Link>
                <span className="ml-2 text-muted-foreground">{provQuery.data.run.status}</span>
              </div>
            </li>
          ) : null}
          {provQuery.data.dataset_version ? (
            <li className="rounded-lg border border-border/60 bg-background/60 p-2">
              <span className="font-semibold text-foreground">Dataset version</span>
              <div className="text-muted-foreground">
                {provQuery.data.dataset_version.dataset_name || "dataset"} v
                {provQuery.data.dataset_version.version}
              </div>
              {provQuery.data.dataset_version.dataset_id ? (
                <Link
                  href={`/datasets/${provQuery.data.dataset_version.dataset_id}?tab=versions`}
                  className="text-primary underline dark:text-primary"
                >
                  Open dataset
                </Link>
              ) : null}
            </li>
          ) : null}
          {provQuery.data.lineage?.edges?.length ? (
            <li className="rounded-lg border border-border/60 bg-background/60 p-2">
              <span className="font-semibold text-foreground">Lineage edges</span>
              <div className="text-muted-foreground">{provQuery.data.lineage.edges.length} edge(s) on run</div>
            </li>
          ) : null}
        </ol>
      ) : null}
    </div>
  );
}
