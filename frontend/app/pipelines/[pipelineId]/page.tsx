"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
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

  const { data } = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineDag(tenantId, projectId, pipelineId, token)
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
    <RouteShell
      activeNav="Pipelines"
      title={`Pipeline ${pipelineId}`}
      subtitle="Orchestration, replay, and debugging — lifecycle trains from Dataset Hub"
    >
      <div className="mb-2 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="rounded-xl px-3 py-2 text-sm"
          onClick={() => router.push("/pipelines")}
        >
          Back to Pipelines
        </Button>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Versions
        </Link>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/diff`}
          className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Config diff
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>DAG</CardTitle>
        </CardHeader>
        <CardContent>
        <DagView tasks={tasks} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Execution gate (advanced / compatibility)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Dataset Readiness</span> and{" "}
            <span className="font-semibold text-foreground">Training Eligibility</span> are evaluated on the{" "}
            <Link href="/datasets" className="font-medium text-primary underline hover:text-foreground">
              Dataset Hub
            </Link>
            . This card is the pipeline <span className="font-semibold text-foreground">Execution Gate</span>{" "}
            (run-level compatibility checks against a synthetic run — API requires maintainer).
          </div>
          {!isMaintainer ? (
            <p className="text-xs text-muted-foreground">
              Execution gate tools are hidden for non-maintainer roles. Ask a maintainer to run checks, or use Dataset Hub
              for lifecycle readiness and training.
            </p>
          ) : gateToolsOpen ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Preference is saved in this browser ({LS_PIPELINE_EXEC_GATE}).
                </span>
                <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={() => persistGateToolsOpen(false)}>
                  Hide execution gate tools
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Scope: tenant <span className="text-foreground">{tenantId}</span> · project{" "}
                <span className="text-foreground">{normalizeProjectId(projectId)}</span>. Use the exact{" "}
                <code className="text-foreground">dataset</code> string from this pipeline version readiness (see Versions →
                config <code className="text-foreground">tasks</code>). Each project or app chooses its own dataset names;
                MLAir does not generate them here.
              </p>
              <div className="mb-3">
                <label className="text-xs text-muted-foreground">
                  Execution gate input dataset name
                  <input
                    value={readinessDatasetInput}
                    onChange={(e) => setReadinessDatasetInput(e.target.value)}
                    placeholder="Must match pipeline readiness inputs[].dataset"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
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
                      setGateError("Enter the readiness input dataset name.");
                      return;
                    }
                    setIsChecking(true);
                    try {
                      const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                      const res = await checkPipelineReadiness(tenantId, projectId, pipelineId, token, {
                        training_mode: trainingMode,
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
                  Check readiness
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Train from{" "}
                <Link href="/datasets" className="font-medium text-primary hover:underline">
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
                <div className="mt-3 rounded-xl border border-border bg-muted p-3">
                  <div className="mb-2 text-xs text-foreground">
                    Ready:{" "}
                    <span className={gateResult.ready ? "text-emerald-400" : "text-red-400"}>{String(gateResult.ready)}</span>
                    {" · "}Mode: {gateResult.training_mode}
                  </div>
                  <DataTableShell>
                    <DataTable className="w-full text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-left">Dataset</th>
                          <th className="px-2 py-1 text-left">Actual</th>
                          <th className="px-2 py-1 text-left">Required</th>
                          <th className="px-2 py-1 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(gateResult.details || []).map((d: any) => (
                          <tr key={`${d.dataset}-${d.role}`} className="border-t border-border">
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
              <span className="text-[11px] text-muted-foreground">Maintainer-only · optional local persistence</span>
            </div>
          )}
        </CardContent>
      </Card>
    </RouteShell>
  );
}
