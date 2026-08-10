"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, Plus } from "lucide-react";
import { useState } from "react";

import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/lib/app-context";
import { createAutomlJob, fetchAutomlJobs, startAutomlSearch } from "@/lib/control-plane-api";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { formatApiClientError } from "@/lib/utils";

export default function AutomlPage() {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qc = useQueryClient();

  const [pipelineId, setPipelineId] = useState("");
  const [datasetId, setDatasetId] = useState("");

  const jobsQ = useQuery({
    queryKey: mlairKeys.controlPlane.automlJobs(tenantId, projectId),
    queryFn: () => fetchAutomlJobs(tenantId, projectId, token),
    enabled: scopePinned,
  });

  const createM = useMutation({
    mutationFn: () =>
      createAutomlJob(tenantId, projectId, token, {
        pipeline_id: pipelineId,
        dataset_id: datasetId || null,
        search_space: {
          strategy: "grid",
          max_trials: 6,
          objective: "maximize",
          parameters: {
            learning_rate: { type: "float", values: [0.01, 0.05, 0.1] },
            max_depth: { type: "int", values: [3, 6, 9] },
          },
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.automlJobs(tenantId, projectId) }),
  });

  const searchM = useMutation({
    mutationFn: (jobId: string) => startAutomlSearch(tenantId, projectId, jobId, token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.automlJobs(tenantId, projectId) }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={FlaskConical} accent="zinc" title="AutoML" />
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : undefined}
      >
        {!scopePinned ? (
          <MlopsEmptyState icon={FlaskConical} title="Pin a project" description="Create and run AutoML search per project." />
        ) : (
          <>
            <section className="panel-surface max-w-xl space-y-3 p-3">
              <h2 className="text-sm font-semibold">New search job</h2>
              <div className="grid gap-3">
                <div><Label className="text-xs">Pipeline ID</Label><Input value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Dataset ID (optional)</Label><Input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="h-8 text-xs" /></div>
              </div>
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => createM.mutate()} disabled={!pipelineId || createM.isPending}>
                <Plus className="h-3.5 w-3.5" /> Create job
              </Button>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Jobs</h2>
              {jobsQ.isError ? <p className="text-xs text-destructive">{formatApiClientError(jobsQ.error)}</p> : null}
              <ul className="text-xs space-y-2">
                {(jobsQ.data?.items || []).map((job) => (
                  <li key={job.job_id} className="panel-surface flex items-center justify-between gap-3 p-2.5">
                    <div>
                      <p className="font-mono text-[11px]">{job.job_id.slice(0, 8)}…</p>
                      <p className="text-muted-foreground">pipeline {job.pipeline_id} · {job.status} · trials {(job.trials || []).length}</p>
                    </div>
                    {job.status === "pending" ? (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => searchM.mutate(job.job_id)} disabled={searchM.isPending}>
                        <Play className="h-3 w-3" /> Start search
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </PageScrollBody>
    </div>
  );
}
