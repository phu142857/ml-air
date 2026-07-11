"use client";

import Link from "next/link";
import { ExternalLink, FileText, GitBranch, Layers, Play, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TraceDetailResponse, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { cn } from "@/lib/utils";

export type TraceCrossLink = {
  id: string;
  label: string;
  href: string;
  icon: typeof Play;
};

export type TraceCrossLinksProps = {
  step: TraceWaterfallStep | null;
  data: TraceDetailResponse | null | undefined;
  waterfall: TraceWaterfall | null;
  traceId: string;
  onOpenLogsTab?: () => void;
  className?: string;
};

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export function resolveTraceCrossLinks({
  step,
  data,
  waterfall,
  traceId,
}: Omit<TraceCrossLinksProps, "className" | "onOpenLogsTab">): TraceCrossLink[] {
  const attrs = step?.attributes ?? {};
  const runId =
    readId(step?.run_id) ||
    (step?.kind === "run" ? readId(step.id) : null) ||
    readId(data?.primary_run_id) ||
    readId(waterfall?.run_id);

  const taskId = readId(step?.task_id) || (step?.kind === "task" ? readId(step.id) : null);

  const matchedRun = runId ? data?.runs?.find((run) => run.run_id === runId) : undefined;

  const pipelineId =
    readId(waterfall?.pipeline_id) ||
    readId(matchedRun?.pipeline_id) ||
    readId(attrs.pipeline_id) ||
    readId(attrs.pipelineId);

  const datasetId = readId(attrs.dataset_id) || readId(attrs.datasetId);
  const modelId = readId(attrs.model_id) || readId(attrs.modelId);

  const links: TraceCrossLink[] = [];

  if (runId) {
    links.push({
      id: "run",
      label: "View Run",
      href: `/runs/${encodeURIComponent(runId)}`,
      icon: Play,
    });
  }

  if (taskId) {
    links.push({
      id: "task",
      label: "View Task",
      href: `/tasks/${encodeURIComponent(taskId)}`,
      icon: Layers,
    });
  }

  if (runId) {
    links.push({
      id: "logs",
      label: "View Logs",
      href: `/runs/${encodeURIComponent(runId)}?tab=logs`,
      icon: FileText,
    });
  }

  if (pipelineId) {
    links.push({
      id: "pipeline",
      label: "View Pipeline",
      href: `/pipelines/${encodeURIComponent(pipelineId)}`,
      icon: GitBranch,
    });
  }

  if (datasetId) {
    links.push({
      id: "dataset",
      label: "View Dataset",
      href: `/datasets/${encodeURIComponent(datasetId)}`,
      icon: Route,
    });
  }

  if (modelId) {
    links.push({
      id: "model",
      label: "View Model",
      href: `/models/${encodeURIComponent(modelId)}`,
      icon: Route,
    });
  }

  if (!step && traceId && data?.primary_run_id) {
    const primary = readId(data.primary_run_id);
    if (primary && !links.some((link) => link.id === "run")) {
      links.unshift({
        id: "primary-run",
        label: "View Run",
        href: `/runs/${encodeURIComponent(primary)}`,
        icon: Play,
      });
    }
  }

  return links;
}

export function TraceCrossLinks({
  step,
  data,
  waterfall,
  traceId,
  onOpenLogsTab,
  className,
}: TraceCrossLinksProps) {
  const links = resolveTraceCrossLinks({ step, data, waterfall, traceId });
  if (!links.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="navigation" aria-label="Related resources">
      {links.map((link) => {
        const Icon = link.icon;
        if (link.id === "logs" && onOpenLogsTab) {
          return (
            <Button
              key={link.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onOpenLogsTab}
              aria-label={link.label}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {link.label}
            </Button>
          );
        }

        return (
          <Button key={link.id} variant="outline" size="sm" className="h-8" asChild>
            <Link href={link.href} aria-label={link.label}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {link.label}
              <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
