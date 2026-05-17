"use client";

import { Database, GitBranch, GitCompare, History } from "lucide-react";
import { ResourcePageHeader, ScopePinnedInline, SubpageBreadcrumb } from "@/components/mlops/layout";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINE_DETAIL } from "@/lib/scope-messages";
import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { normalizePipelineForDag } from "@/lib/adapt-pipeline-dag";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { fetchPipelineVersions, fetchPipelines } from "@/lib/api";
import { usePipelineTopology } from "@/hooks/use-pipeline-topology";
import { mlairKeys } from "@/lib/query-keys";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { useAppContext } from "@/lib/app-context";
import { formatRelativeTime } from "@/lib/utils";

export default function PipelineDetailPage() {
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = params.pipelineId;
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);

  const { topologyQuery, topology, pipeline: topologyPipeline, isLoading: topologyLoading } =
    usePipelineTopology(tenantId, projectId, pipelineId, token, scopePinned);

  const { data: pipelinesList } = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()) && scopePinned,
  });

  const { data: versionsData } = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token?.trim()) && scopePinned,
  });

  const pipelineRow = useMemo(
    () => pipelinesList?.items?.find((p) => p.pipeline_id === pipelineId),
    [pipelinesList, pipelineId],
  );

  const latestConfigVersion = useMemo(() => {
    const items = versionsData?.items ?? [];
    if (!items.length) return null;
    return items.reduce((a, b) => (a.version >= b.version ? a : b));
  }, [versionsData]);

  const resolvedPipelineId = topology?.pipeline_id ?? pipelineId;
  const latestRunId = pipelineRow?.latest_run_id?.trim() || "";

  const headerSubtitle = pipelineRow
    ? `${pipelineRow.total_runs} total runs · last ${String(pipelineRow.latest_status || "—")}${pipelineRow.updated_at ? ` · updated ${formatRelativeTime(pipelineRow.updated_at)}` : ""}`
    : "Orchestration and observability — run and train from Dataset Hub";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubpageBreadcrumb
        segments={[
          { label: "Pipelines", href: "/pipelines" },
          { label: pipelineId, mono: true },
        ]}
      />
      <ResourcePageHeader
        icon={GitBranch}
        accent="amber"
        title={`Pipeline · ${pipelineId}`}
        subtitle={headerSubtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-border bg-card text-foreground/90 hover:bg-muted"
              asChild
            >
              <Link href="/pipelines">All pipelines</Link>
            </Button>
            <Button
              size="sm"
              className="h-8 gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={!scopePinned}
              title={!scopePinned ? "Pin tenant and project to open Dataset Hub." : undefined}
              asChild={scopePinned}
            >
              {scopePinned ? (
                <Link href="/datasets">
                  <Database className="h-3.5 w-3.5" />
                  Run / Train
                </Link>
              ) : (
                <span>
                  <Database className="h-3.5 w-3.5" />
                  Run / Train
                </span>
              )}
            </Button>
          </div>
        }
      />
      <div className="flex-1 space-y-6 overflow-auto p-6">
        {!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINE_DETAIL} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-border bg-background/50 text-foreground hover:bg-card"
          >
            <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}>
              <History className="h-3.5 w-3.5 text-amber-400" />
              Versions
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-border bg-background/50 text-foreground hover:bg-card"
          >
            <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/diff`}>
              <GitCompare className="h-3.5 w-3.5 text-amber-400" />
              Config diff
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest config</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {latestConfigVersion != null ? (
                <>
                  v{latestConfigVersion.version}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`} className="text-sky-400 hover:underline">
                      View versions
                    </Link>
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline id</p>
            <p className="mt-1 truncate font-mono text-sm text-foreground/90">{resolvedPipelineId}</p>
          </div>
          <div className="rounded-lg border border-border bg-card/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest run</p>
            <p className="mt-1 text-sm text-foreground/90">
              {latestRunId ? (
                <Link
                  className="font-mono text-sky-400 hover:underline"
                  href={`/runs/${encodeURIComponent(latestRunId)}`}
                >
                  {latestRunId}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        <DetailSection
          title="Pipeline topology"
          description="Static stages and dependencies from the latest pipeline config (no run overlay)."
          accentBorder="amber"
        >
          {!scopePinned ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
              Pin a tenant and project in the header to load pipeline topology.
            </div>
          ) : topologyLoading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
              Loading topology…
            </div>
          ) : topologyQuery.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not load topology: {String(topologyQuery.error)}
            </div>
          ) : topologyPipeline ? (
            <PipelineDAG key={pipelineId} pipeline={normalizePipelineForDag(topologyPipeline)!} />
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              No topology for this pipeline.
            </div>
          )}
        </DetailSection>

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Production runs start from{" "}
          <Link href="/datasets" className="font-medium text-emerald-400 hover:underline">
            Dataset Hub
          </Link>
          : train with a model (mapped pipeline) or run a pipeline explicitly. This page shows topology and versions;
          open a run for live execution status.
        </div>
      </div>
    </div>
  );
}
