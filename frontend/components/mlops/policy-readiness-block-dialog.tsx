"use client";

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
import {
  failingCriteriaFromSnapshot,
  type MlairPolicyReadinessBlock,
} from "@/lib/mlair-policy-readiness";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: MlairPolicyReadinessBlock | null;
  datasetId: string;
  intentLabel: string;
};

function blockTitle(block: MlairPolicyReadinessBlock): string {
  switch (block.kind) {
    case "no_policy":
      return "Training policy required";
    case "no_version":
      return "Dataset version required";
    case "not_eligible":
      return "Training eligibility not met";
    case "check_failed":
      return "Readiness check failed";
    default:
      return "Cannot start run";
  }
}

function blockMessage(block: MlairPolicyReadinessBlock): string {
  switch (block.kind) {
    case "no_policy":
    case "no_version":
    case "check_failed":
      return block.message;
    case "not_eligible":
      return "This dataset version does not pass the active MLAir training policy. Run / Train was not started.";
    default:
      return "";
  }
}

export function PolicyReadinessBlockDialog({ open, onOpenChange, block, datasetId, intentLabel }: Props) {
  const failing =
    block?.kind === "not_eligible" ? failingCriteriaFromSnapshot(block.snapshot) : [];
  const reasons =
    block?.kind === "not_eligible"
      ? (block.snapshot.reasons || []).map((r) =>
          typeof r === "string" ? r : String((r as Record<string, unknown>).message || JSON.stringify(r))
        )
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{block ? blockTitle(block) : "Blocked"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {block ? blockMessage(block) : null}
            {block ? (
              <span className="mt-1 block text-[11px]">
                MLAir policy gate · {intentLabel}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {failing.length > 0 ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs">
            {failing.map((c) => (
              <li key={c.code} className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{c.label || c.code}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {reasons.length > 0 ? (
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {reasons.map((line, i) => (
              <li key={i} className="font-mono">
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/datasets/${encodeURIComponent(datasetId)}?tab=readiness`} onClick={() => onOpenChange(false)}>
              Open Readiness tab
            </Link>
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
