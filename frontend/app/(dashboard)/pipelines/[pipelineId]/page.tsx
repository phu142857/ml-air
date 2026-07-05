"use client";

import { Database, GitBranch, GitCompare, History } from "lucide-react";
import {
  DetailSection,
  PageScrollBody,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINE_DETAIL } from "@/lib/scope-messages";
import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { normalizePipelineForDag } from "@/lib/adapt-pipeline-dag";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { PipelineConfigEditorDialog } from "@/components/mlops/pipeline-config-editor-dialog";
import { fetchPipelineVersions, fetchPipelines } from "@/lib/api";
import { pickLatestPipelineVersion } from "@/lib/pipeline-config";
import { usePipelineTopology } from "@/hooks/use-pipeline-topology";
import { useRunExecutionGraph } from "@/hooks/use-run-execution-graph";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { useAppContext } from "@/lib/app-context";
import { formatRelativeTime } from "@/lib/utils";

export default function PipelineDetailPage() {
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = params.pipelineId;
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);

  const poll = useRealtimeQueryPolling();
  const { topologyQuery, topology, pipeline: topologyPipeline, isLoading: topologyLoading } =
    usePipelineTopology(tenantId, projectId, pipelineId, token, scopePinned);

  const { data: pipelinesList } = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()) && scopePinned,
    refetchOnMount: "always",
    ...poll,
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

  const versionItems = versionsData?.items ?? [];
  const latestConfigVersion = useMemo(
    () => pickLatestPipelineVersion(versionItems),
    [versionItems],
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [dagView, setDagView] = useState<"config" | "latest-run">("latest-run");

  useEffect(() => {
    if (!versionItems.length) {
      setSelectedVersionId("");
      return;
    }
    const preferred =
      selectedVersionId && versionItems.some((v) => v.version_id === selectedVersionId)
        ? selectedVersionId
        : latestConfigVersion?.version_id;
    if (preferred && preferred !== selectedVersionId) setSelectedVersionId(preferred);
  }, [versionItems, latestConfigVersion?.version_id, selectedVersionId]);

  const selectedConfigVersion = useMemo(
    () => versionItems.find((v) => v.version_id === selectedVersionId) ?? latestConfigVersion,
    [versionItems, selectedVersionId, latestConfigVersion],
  );

  const versionOptions = useMemo(
    () =>
      versionItems.map((v) => ({
        value: v.version_id,
        label: `v${v.version}${v.version_id === latestConfigVersion?.version_id ? " (latest)" : ""}`,
      })),
    [versionItems, latestConfigVersion?.version_id],
  );

  const resolvedPipelineId = topology?.pipeline_id ?? pipelineId;
  const latestRunId = pipelineRow?.latest_run_id?.trim() || "";

  const { pipeline: runOverlayPipeline, isLoading: runOverlayLoading, graphQuery: runGraphQuery } =
    useRunExecutionGraph(tenantId, projectId, latestRunId, token, scopePinned && Boolean(latestRunId));

  useEffect(() => {
    if (!latestRunId) setDagView("config");
  }, [latestRunId]);

  const dagPipeline = useMemo(() => {
    if (dagView === "latest-run" && runOverlayPipeline) {
      return normalizePipelineForDag(runOverlayPipeline);
    }
    if (topologyPipeline) return normalizePipelineForDag(topologyPipeline);
    return null;
  }, [dagView, runOverlayPipeline, topologyPipeline]);

  const dagTaskScope =
    dagView === "latest-run" && latestRunId
      ? { runId: latestRunId, tenantId, projectId }
      : undefined;

  const headerSubtitle = pipelineRow
    ? `${pipelineRow.total_runs} total runs · last ${String(pipelineRow.latest_status || "—")}${pipelineRow.updated_at ? ` · updated ${formatRelativeTime(pipelineRow.updated_at)}` : ""}`
    : "Orchestration and observability — run and train from Dataset Hub";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
        subtitle={
          selectedConfigVersion
            ? `${headerSubtitle} · config v${selectedConfigVersion.version}`
            : headerSubtitle
        }
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
              className="h-8 gap-2"
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
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINE_DETAIL} /> : null}
      >

        <div className="flex flex-wrap items-center gap-2">
          {versionOptions.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Config version</span>
              <SelectDropdown
                value={selectedVersionId}
                onChange={setSelectedVersionId}
                options={versionOptions}
                buttonClassName="inset-surface min-w-[10rem] px-2 py-1.5 font-mono text-xs text-foreground"
                aria-label="Pipeline config version"
              />
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-border bg-background/50 text-foreground hover:bg-card"
            disabled={!selectedVersionId}
            onClick={() => setConfigModalOpen(true)}
          >
            View config
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-border bg-background/50 text-foreground hover:bg-card"
          >
            <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}>
              <History className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />
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
              <GitCompare className="h-3.5 w-3.5 text-[color:var(--status-pending-fg)]" />
              Config diff
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="panel-surface px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline id</p>
            <p className="mt-1 truncate font-mono text-sm text-foreground/90">{resolvedPipelineId}</p>
          </div>
          <div className="panel-surface px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest run</p>
            <p className="mt-1 text-sm text-foreground/90">
              {latestRunId ? (
                <Link
                  className="font-mono text-primary hover:underline"
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
          description={
            dagView === "latest-run" && latestRunId
              ? `Task status overlay from latest run ${latestRunId.slice(0, 12)}… — click a node to open task detail.`
              : "Static stages and dependencies from the latest pipeline config."
          }
          accentBorder="amber"
          headerActions={
            latestRunId ? (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    dagView === "latest-run"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setDagView("latest-run")}
                >
                  Latest run
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    dagView === "config"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setDagView("config")}
                >
                  Config only
                </button>
              </div>
            ) : null
          }
        >
          {!scopePinned ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
              Pin a tenant and project in the header to load pipeline topology.
            </div>
          ) : dagView === "latest-run" && latestRunId && runOverlayLoading ? (
            <div className="flex min-h-[260px] items-center justify-center inset-surface text-sm text-muted-foreground">
              Loading run overlay…
            </div>
          ) : dagView === "latest-run" && latestRunId && runGraphQuery.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not load run overlay: {String(runGraphQuery.error)}
            </div>
          ) : topologyLoading && dagView === "config" ? (
            <div className="flex min-h-[260px] items-center justify-center inset-surface text-sm text-muted-foreground">
              Loading topology…
            </div>
          ) : topologyQuery.isError && dagView === "config" ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not load topology: {String(topologyQuery.error)}
            </div>
          ) : dagPipeline ? (
            <PipelineDAG key={`${pipelineId}-${dagView}-${latestRunId || "cfg"}`} pipeline={dagPipeline} taskScope={dagTaskScope} />
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              No topology for this pipeline.
            </div>
          )}
        </DetailSection>

        <div className="inset-surface px-4 py-3 text-sm text-muted-foreground">
          Production runs start from{" "}
          <Link href="/datasets" className="font-medium text-[color:var(--status-success-fg)] hover:underline">
            Dataset Hub
          </Link>
          : train with a model (mapped pipeline) or run a pipeline explicitly. This page shows topology and versions;
          open a run for live execution status.
        </div>
      </PageScrollBody>

      <PipelineConfigEditorDialog
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
        tenantId={tenantId}
        projectId={projectId}
        pipelineId={pipelineId}
        token={token}
        versionId={selectedVersionId}
      />
    </div>
  );
}
