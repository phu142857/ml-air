"use client";

import { Play, Route } from "lucide-react";

import { MlopsEmptyState } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";

export type TraceWorkspaceEmptyProps = {
  onTriggerRun: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  className?: string;
};

export function TraceWorkspaceEmpty({
  onTriggerRun,
  onRefresh,
  refreshing,
  className,
}: TraceWorkspaceEmptyProps) {
  return (
    <MlopsEmptyState
      icon={Route}
      title="No trace selected"
      description="Choose a trace or trigger a pipeline to begin."
      className={className}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" onClick={onTriggerRun}>
            <Play className="h-3.5 w-3.5" aria-hidden />
            Trigger Run
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={onRefresh}
          >
            Refresh
          </Button>
        </div>
      }
    />
  );
}
