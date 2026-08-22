"use client";

import { Play, Route } from "lucide-react";

import { MlopsEmptyState } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";

export type TraceWorkspaceEmptyProps = {
  onTriggerRun: () => void;
  className?: string;
};

export function TraceWorkspaceEmpty({
  onTriggerRun,
  className,
}: TraceWorkspaceEmptyProps) {
  return (
    <MlopsEmptyState
      icon={Route}
      title="No trace selected"
      className={className}
      action={
        <Button type="button" size="sm" onClick={onTriggerRun}>
          <Play className="h-3.5 w-3.5" aria-hidden />
          Trigger Run
        </Button>
      }
    />
  );
}
