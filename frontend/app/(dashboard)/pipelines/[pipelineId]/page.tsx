"use client";

import { GitBranch, Play } from "lucide-react";
import { ResourcePageHeader } from "@/components/layout/page-chrome";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog";
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync";
import { ScopePinnedBanner } from "@/components/mlops/scope-pinned-banner";
import { isScopePinned } from "@/lib/scope";
import { DagView } from "@/components/pipeline/dag-view";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { checkPipelineReadiness, fetchPipelineDag, normalizeProjectId } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";

const LS_PIPELINE_EXEC_GATE = "mlair:pipeline-execution-gate-tools";

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

  const { data } = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineDag(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token?.trim()) && scopePinned,
  });

  const tasks = useMemo(
    () => (data?.nodes ?? []).map((node) => ({ task_id: node.id, status: node.status, attempt: 1 })),
    [data]
  );

  const scopeRole = useMemo(() => {
    const t = String(tenantId || "").trim();
    const np = normalizeProjectId(String(projectId || "").trim());
    const row = accessibleScopes.find(
      (s) => String(s.tenant_id || "").trim() === t && normalizeProjectId(String(s.project_id || "").trim()) === np
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

  return (
    <div className="flex h-full flex-col">
      <TriggerRunUrlSync enabled={scopePinned} onOpen={() => setTriggerOpen(true)} />
      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={pipelineId}
        mode="gated"
        lockPipeline
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />
      <ResourcePageHeader
        icon={GitBranch}
        accent="amber"
        title={`Pipeline · ${pipelineId}`}
        subtitle="Orchestration, replay, and debugging — lifecycle trains from Dataset Hub"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              onClick={() => router.push("/pipelines")}
            >
              All pipelines
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" asChild>
              <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}>Versions</Link>
            </Button>
            <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-500" asChild>
              <Link href={`/pipelines/${encodeURIComponent(pipelineId)}/diff`}>Config diff</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-sky-600 text-white hover:bg-sky-500"
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
      <div className="flex-1 overflow-auto p-6">
      <ScopePinnedBanner className="mb-4" message="Pin tenant and project in the header to load this pipeline DAG and start gated runs." />
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-zinc-200">DAG</CardTitle>
        </CardHeader>
        <CardContent>
        <DagView tasks={tasks} />
        </CardContent>
      </Card>
      <Card className="mt-6 border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-zinc-200">Execution gate (advanced / compatibility)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-500">
            <span className="font-semibold text-zinc-100">Dataset Readiness</span> and{" "}
            <span className="font-semibold text-zinc-100">Training Eligibility</span> are evaluated on the{" "}
            <Link href="/datasets" className="font-medium text-sky-400 underline hover:text-zinc-100">
              Dataset Hub
            </Link>
            . This card is the pipeline <span className="font-semibold text-zinc-100">Execution Gate</span>{" "}
            (run-level compatibility checks against a synthetic run — API requires maintainer).
          </div>
          {!isMaintainer ? (
            <p className="text-xs text-zinc-500">
              Execution gate tools are hidden for non-maintainer roles. Ask a maintainer to run checks, or use Dataset Hub
              for lifecycle readiness and training.
            </p>
          ) : gateToolsOpen ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">
                  Preference is saved in this browser ({LS_PIPELINE_EXEC_GATE}).
                </span>
                <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={() => persistGateToolsOpen(false)}>
                  Hide execution gate tools
                </Button>
              </div>
              <p className="mb-3 text-xs text-zinc-500">
                Scope: tenant <span className="text-zinc-100">{tenantId}</span> · project{" "}
                <span className="text-zinc-100">{normalizeProjectId(projectId)}</span>. Use the exact{" "}
                <code className="text-zinc-100">dataset</code> string from this pipeline version readiness (see Versions →
                config <code className="text-zinc-100">tasks</code>). Each project or app chooses its own dataset names;
                MLAir does not generate them here.
              </p>
              <div className="mb-3">
                <label className="text-xs text-zinc-500">
                  Execution gate input dataset name
                  <input
                    value={readinessDatasetInput}
                    onChange={(e) => setReadinessDatasetInput(e.target.value)}
                    placeholder="Must match pipeline readiness inputs[].dataset"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-100"
                  />
                </label>
              </div>
              <div className="mb-3">
                <label className="text-xs text-zinc-500">
                  Optional dataset version id (immutable snapshot)
                  <input
                    value={readinessDatasetVersionId}
                    onChange={(e) => setReadinessDatasetVersionId(e.target.value)}
                    placeholder="dataset_versions.version_id — leave empty to use mutable aggregate size"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>
              </div>
              <TrainingGateFields
                trainingMode={trainingMode}
                onTrainingModeChange={setTrainingMode}
                requiredSize={requiredSize}
                onRequiredSizeChange={setRequiredSize}
                className="mb-3"
              />
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  disabled={isChecking || !readinessDatasetInput.trim()}
                  onClick={async () => {
                    setGateError("");
                    const datasetName = readinessDatasetInput.trim();
                    if (!datasetName) {
                      setGateError("Enter the execution gate dataset name (must match pipeline version inputs[].dataset).");
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
                          inputs: [{ dataset: datasetName, required_size: required }]
                        }
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
              <p className="mt-2 text-xs text-zinc-500">
                Train from{" "}
                <Link href="/datasets" className="font-medium text-sky-400 hover:underline">
                  Dataset Hub
                </Link>{" "}
                for lifecycle-centric flow.
              </p>
              {gateError ? (
                <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {gateError}
                </div>
              ) : null}
              {gateResult ? (
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 text-xs text-zinc-100">
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
                  <DataTableShell>
                    <DataTable className="text-xs">
                      <thead className="bg-zinc-950/60 text-zinc-500">
                        <tr>
                          <th className="px-2 py-1 text-left">Dataset</th>
                          <th className="px-2 py-1 text-left">Actual</th>
                          <th className="px-2 py-1 text-left">Required</th>
                          <th className="px-2 py-1 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(gateResult.details || []).map((d: any) => (
                          <tr key={`${d.dataset}-${d.role}`} className="border-t border-zinc-800">
                            <td className="px-2 py-1">{d.dataset}</td>
                            <td className="px-2 py-1">{d.actual_size}</td>
                            <td className="px-2 py-1">{d.required_size}</td>
                            <td className="px-2 py-1">{d.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </DataTableShell>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" className="px-3 py-2 text-xs" variant="secondary" onClick={() => persistGateToolsOpen(true)}>
                Show execution gate tools
              </Button>
              <span className="text-[11px] text-zinc-500">Maintainer-only · optional local persistence</span>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
