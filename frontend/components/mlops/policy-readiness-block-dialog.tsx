"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PipelineConfigEditorDialog } from "@/components/mlops/pipeline-config-editor-dialog";
import {
  failingCriteriaFromSnapshot,
  type TrainGateBlock,
} from "@/lib/mlair-policy-readiness";
import { STATUS_CHIP_CLASS } from "@/lib/status-style";

type PipelineGateContext = {
  pipelineId: string;
  tenantId: string;
  projectId: string;
  token: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: TrainGateBlock | null;
  datasetId: string;
  intentLabel: string;
  /** Required to open pipeline config when the pipeline input gate blocks. */
  pipelineGateContext?: PipelineGateContext | null;
};

function blockTitle(block: TrainGateBlock): string {
  switch (block.kind) {
    case "no_policy":
      return "Training policy required";
    case "no_version":
      return "Dataset version required";
    case "not_eligible":
      return "Training eligibility not met";
    case "not_ready":
      return "Pipeline input requirements not met";
    case "no_pipeline":
      return "Pipeline not resolved";
    case "check_failed":
      return "Gate check failed";
    default:
      return "Cannot start run";
  }
}

function blockMessage(block: TrainGateBlock): string {
  switch (block.kind) {
    case "no_policy":
    case "no_version":
    case "no_pipeline":
    case "check_failed":
      return block.message;
    case "not_eligible":
      return "This dataset version does not pass the active MLAir training policy. Run / Train was not started.";
    case "not_ready":
      return "Pipeline version declares input datasets with required_size that are not satisfied. Run / Train was not started.";
    default:
      return "";
  }
}

export function PolicyReadinessBlockDialog({
  open,
  onOpenChange,
  block,
  datasetId,
  intentLabel,
  pipelineGateContext,
}: Props) {
  const [pipelineConfigOpen, setPipelineConfigOpen] = useState(false);
  const isPipelineGate = block?.kind === "not_ready";
  const failing =
    block?.kind === "not_eligible" ? failingCriteriaFromSnapshot(block.snapshot) : [];
  const pipelineReasons =
    block?.kind === "not_ready"
      ? (block.result.reasons || []).map((r) => r.message || r.code || "").filter(Boolean)
      : [];
  const pipelineDetails = block?.kind === "not_ready" ? block.result.blocking_datasets || [] : [];
  const reasons =
    block?.kind === "not_eligible"
      ? (block.snapshot.reasons || []).map((r) =>
          typeof r === "string" ? r : String((r as Record<string, unknown>).message || JSON.stringify(r))
        )
      : [];

  return (
    <Fragment>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[color:var(--status-failed-fg)]">
            {block ? blockTitle(block) : "Blocked"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {block ? blockMessage(block) : null}
            {block ? (
              <span className="mt-1 block text-[11px]">
                {block.kind === "not_ready" ? "Pipeline input gate" : "MLAir training policy gate"} · {intentLabel}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {failing.length > 0 ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] px-3 py-2 text-xs">
            {failing.map((c) => (
              <li key={c.code} className="flex flex-col gap-0.5">
                <span className="font-medium text-[color:var(--status-failed-fg)]">{c.label || c.code}</span>
                <span className="font-mono text-[10px] text-[color:var(--status-failed-fg)]/80">{c.code}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {pipelineDetails.length > 0 ? (
          <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs">
            {pipelineDetails.map((row) => (
              <li key={String(row.dataset || "")} className="font-mono text-[11px]">
                {String(row.dataset)}: {Number(row.actual_size)} / {Number(row.required_size)} rows
                {row.dataset_version_id ? ` · ${String(row.dataset_version_id).slice(0, 8)}…` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        {reasons.length > 0 || pipelineReasons.length > 0 ? (
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {[...reasons, ...pipelineReasons].map((line, i) => (
              <li key={i} className="font-mono">
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {isPipelineGate && pipelineGateContext?.pipelineId ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPipelineConfigOpen(true);
                }}
              >
                View pipeline config
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link
                  href={`/pipelines/${encodeURIComponent(pipelineGateContext.pipelineId)}/versions`}
                  onClick={() => onOpenChange(false)}
                >
                  Versions page
                </Link>
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link
                href={`/datasets/${encodeURIComponent(datasetId)}?tab=readiness`}
                onClick={() => onOpenChange(false)}
              >
                Open Readiness tab
              </Link>
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {pipelineGateContext?.pipelineId ? (
        <PipelineConfigEditorDialog
          open={pipelineConfigOpen}
          onOpenChange={setPipelineConfigOpen}
          tenantId={pipelineGateContext.tenantId}
          projectId={pipelineGateContext.projectId}
          pipelineId={pipelineGateContext.pipelineId}
          token={pipelineGateContext.token}
        />
      ) : null}
    </Fragment>
  );
}
