"use client";

import { GitBranch, GitCompare, History, Play } from "lucide-react";
import { ResourcePageHeader, ScopePinnedInline, SubpageBreadcrumb } from "@/components/mlops/layout";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog";
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINE_DETAIL } from "@/lib/scope-messages";
import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { pipelineFromDagQueryData } from "@/lib/adapt-pipeline-dag";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import { DetailSection } from "@/components/mlops/layout";
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkPipelineReadiness,
  fetchPipelineDag,
  fetchPipelineVersions,
  fetchPipelines,
  normalizeProjectId,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { formatRelativeTime } from "@/lib/utils";

const LS_PIPELINE_EXEC_GATE = "mlair:pipeline-execution-gate-tools";

type GateDetailRow = {
  dataset: string;
  role?: string;
  actual_size: number;
  required_size: number;
  status: string;
};

export default function PipelineDetailPage() {
  const router = useRouter();
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = params.pipelineId;
  const { tenantId, projectId, token, accessibleScopes } = useAppContext();
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [gateResult, setGateResult] = useState<any>(null);
  const [gateError, setGateError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  /** Must match the `dataset` string in this pipeline's readiness inputs (pipeline version config). */
  const [readinessDatasetInput, setReadinessDatasetInput] = useState("");
  /** Optional `dataset_versions.version_id` — pins execution gate to immutable row count. */
  const [readinessDatasetVersionId, setReadinessDatasetVersionId] = useState("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const scopePinned = isScopePinned(tenantId, projectId);

  const dagQuery = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineDag(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token?.trim()) && scopePinned,
  });
  const data = dagQuery.data;

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

  const dagPipeline = useMemo(
    () => pipelineFromDagQueryData(pipelineId, data),
    [data, pipelineId],
  );

  const scopeRole = useMemo(() => {
    const t = String(tenantId || "").trim();
    const np = normalizeProjectId(String(projectId || "").trim());
    const row = accessibleScopes.find(
      (s) => String(s.tenant_id || "").trim() === t && normalizeProjectId(String(s.project_id || "").trim()) === np,
    );
    return String(row?.role || accessibleScopes[0]?.role || "").trim();
  }, [accessibleScopes, tenantId, projectId]);

  const isMaintainer = useMemo(() => {
    const r = scopeRole.toLowerCase();
    return r === "maintainer" || r === "admin";
  }, [scopeRole]);

  const gateDefaultOpen =
    String(process.env.NEXT_PUBLIC_MLAIR_PIPELINE_EXECUTION_GATE_DEFAULT || "")
      .trim()
      .toLowerCase() === "open";

  const [gateToolsOpen, setGateToolsOpen] = useState(gateDefaultOpen);

  const gateColumns: DataTableColumn<GateDetailRow>[] = useMemo(
    () => [
      {
        id: "dataset",
        header: "Dataset",
        cell: (row) => <span className="font-mono text-xs">{row.dataset}</span>,
      },
      {
        id: "actual",
        header: "Actual",
        cell: (row) => <span className="tabular-nums">{row.actual_size}</span>,
      },
      {
        id: "required",
        header: "Required",
        cell: (row) => <span className="tabular-nums">{row.required_size}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant="outline" className="text-[10px] capitalize">
            {row.status}
          </Badge>
        ),
      },
    ],
    [],
  );

  useEffect(() => {
    if (gateDefaultOpen) return;
    if (!isMaintainer) return;
    try {
      if (typeof window !== "undefined" && localStorage.getItem(LS_PIPELINE_EXEC_GATE) === "1") {
        setGateToolsOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [isMaintainer, gateDefaultOpen]);

  const persistGateToolsOpen = (open: boolean) => {
    setGateToolsOpen(open);
    if (!isMaintainer) return;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_PIPELINE_EXEC_GATE, open ? "1" : "0");
      }
    } catch {
      /* ignore */
    }
  };

  const resolvedPipelineId = data?.pipeline_id ?? pipelineId;
  const latestRunId = pipelineRow?.latest_run_id?.trim() || data?.run_id?.trim() || "";

  const headerSubtitle = pipelineRow
    ? `${pipelineRow.total_runs} total runs · last ${String(pipelineRow.latest_status || "—")}${pipelineRow.updated_at ? ` · updated ${formatRelativeTime(pipelineRow.updated_at)}` : ""}`
    : "Orchestration and debugging — lifecycle training uses Dataset Hub";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TriggerRunUrlSync enabled={scopePinned} onOpen={() => setTriggerOpen(true)} />
      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={pipelineId}
        mode="gated"
        lockPipeline
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />
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
              onClick={() => router.push("/pipelines")}
            >
              All pipelines
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 bg-sky-600 text-white hover:bg-sky-500"
              disabled={!token.trim() || !scopePinned}
              title={!scopePinned ? "Select a specific tenant and project to trigger a run." : undefined}
              onClick={() => setTriggerOpen(true)}
            >
              <Play className="h-3.5 w-3.5" />
              Trigger run
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
          title="Pipeline DAG"
          description="Stages and dependency shape from the live DAG endpoint."
          accentBorder="amber"
        >
          {!scopePinned ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
              Pin a tenant and project in the header to load the pipeline DAG.
            </div>
          ) : dagQuery.isLoading ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not load DAG: {String(dagQuery.error)}
            </div>
          ) : dagPipeline ? (
            <PipelineDAG pipeline={dagPipeline} />
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              No DAG data for this pipeline.
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="Execution gate"
          description="Maintainer-only check-readiness. Readiness and training live on Dataset Hub."
          accentBorder="amber"
          bodyClassName="p-0"
        >
          <div className="border-b border-border/80 px-4 py-3 text-xs text-muted-foreground">
            Use the <code className="text-foreground">dataset</code> string from this pipeline’s version config (
            <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`} className="text-sky-400 hover:underline">
              Versions
            </Link>
            ).{" "}
            <Link href="/datasets" className="text-sky-400 hover:underline">
              Dataset Hub
            </Link>{" "}
            covers lifecycle readiness.
          </div>

          {!isMaintainer ? (
            <div className="p-4 text-xs text-muted-foreground">
              Maintainer-only. Use{" "}
              <Link href="/datasets" className="text-sky-400 hover:underline">
                Dataset Hub
              </Link>{" "}
              for readiness and training.
            </div>
          ) : (
            <div className="p-4 pt-3">
              <details
                className="rounded-lg border border-border bg-muted/20 px-3 py-2"
                open={gateToolsOpen}
                onToggle={(e) => persistGateToolsOpen(e.currentTarget.open)}
              >
                <summary className="cursor-pointer select-none text-xs font-medium text-foreground hover:text-foreground/90">
                  <span className="text-sky-400">{gateToolsOpen ? "Less" : "More"}</span>
                  <span className="text-muted-foreground"> · </span>
                  gate parameters &amp; check results
                </summary>
                <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Preference for open/closed is saved in this browser ({LS_PIPELINE_EXEC_GATE}).
                  </p>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Execution gate input dataset name
                    <input
                      value={readinessDatasetInput}
                      onChange={(e) => setReadinessDatasetInput(e.target.value)}
                      placeholder="Must match pipeline readiness inputs[].dataset"
                      className="mt-1 w-full rounded-lg border border-border bg-muted/30 px-2 py-2 text-xs text-foreground"
                    />
                  </label>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Optional dataset version id (immutable snapshot)
                    <input
                      value={readinessDatasetVersionId}
                      onChange={(e) => setReadinessDatasetVersionId(e.target.value)}
                      placeholder="dataset_versions.version_id — leave empty to use mutable aggregate size"
                      className="mt-1 w-full rounded-lg border border-border bg-muted/30 px-2 py-2 font-mono text-xs text-foreground"
                    />
                  </label>
                </div>
                <TrainingGateFields
                  trainingMode={trainingMode}
                  onTrainingModeChange={setTrainingMode}
                  requiredSize={requiredSize}
                  onRequiredSizeChange={setRequiredSize}
                />
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    disabled={isChecking || !readinessDatasetInput.trim()}
                    onClick={async () => {
                      setGateError("");
                      const datasetName = readinessDatasetInput.trim();
                      if (!datasetName) {
                        setGateError(
                          "Enter the execution gate dataset name (must match pipeline version inputs[].dataset).",
                        );
                        return;
                      }
                      setIsChecking(true);
                      try {
                        const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                        const vid = readinessDatasetVersionId.trim();
                        const res = await checkPipelineReadiness(tenantId, projectId, pipelineId, token, {
                          training_mode: trainingMode,
                          ...(vid ? { dataset_version_id: vid } : {}),
                          override_config: {
                            inputs: [{ dataset: datasetName, required_size: required }],
                          },
                        });
                        setGateResult(res);
                      } catch (e: any) {
                        setGateError(String(e?.message || e));
                      } finally {
                        setIsChecking(false);
                      }
                    }}
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                  >
                    Run execution gate check
                  </Button>
                </div>
                {gateError ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {gateError}
                  </div>
                ) : null}
                {gateResult ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <div className="mb-2 text-xs text-foreground">
                      Ready:{" "}
                      <span
                        className={
                          gateResult.ready
                            ? "text-[color:var(--status-success-fg)]"
                            : "text-[color:var(--status-failed-fg)]"
                        }
                      >
                        {String(gateResult.ready)}
                      </span>
                      {" · "}Mode: {gateResult.training_mode}
                    </div>
                    <DataTable
                      columns={gateColumns}
                      data={(gateResult.details || []) as GateDetailRow[]}
                      keyExtractor={(row) => `${row.dataset}-${row.role ?? ""}`}
                      emptyMessage="No gate detail rows."
                    />
                  </div>
                ) : null}
                </div>
              </details>
            </div>
          )}
        </DetailSection>
      </div>
    </div>
  );
}
