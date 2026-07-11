"use client";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { TraceWaterfallStep } from "@/lib/api";
import { cn } from "@/lib/utils";

import { buildSpanBreadcrumb, type TraceBreadcrumbSegment } from "./trace-tree-utils";

export type TraceSpanBreadcrumbProps = {
  steps: TraceWaterfallStep[];
  selectedStep: TraceWaterfallStep | null;
  onSelectStep: (step: TraceWaterfallStep | null) => void;
  className?: string;
};

function BreadcrumbSegment({
  segment,
  isCurrent,
  onSelect,
}: {
  segment: TraceBreadcrumbSegment;
  isCurrent: boolean;
  onSelect: (step: TraceWaterfallStep | null) => void;
}) {
  if (segment.id === "__ellipsis__") {
    return (
      <BreadcrumbItem>
        <BreadcrumbEllipsis className="size-6" />
      </BreadcrumbItem>
    );
  }

  if (isCurrent) {
    return (
      <BreadcrumbItem>
        <BreadcrumbPage className="max-w-[12rem] truncate font-medium">
          {segment.label}
        </BreadcrumbPage>
      </BreadcrumbItem>
    );
  }

  return (
    <BreadcrumbItem>
      <BreadcrumbLink asChild>
        <button
          type="button"
          className="max-w-[10rem] truncate text-left transition-default hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onSelect(segment.step)}
          aria-label={segment.step ? `Select span ${segment.label}` : "Show trace overview"}
        >
          {segment.label}
        </button>
      </BreadcrumbLink>
    </BreadcrumbItem>
  );
}

export function TraceSpanBreadcrumb({
  steps,
  selectedStep,
  onSelectStep,
  className,
}: TraceSpanBreadcrumbProps) {
  const segments = buildSpanBreadcrumb(steps, selectedStep);
  if (!segments.length) return null;

  return (
    <Breadcrumb
      className={cn(
        "sticky top-0 z-[11] shrink-0 border-b border-border bg-card px-3 py-2",
        className,
      )}
      aria-label="Span hierarchy"
    >
      <BreadcrumbList className="text-xs">
        {segments.map((segment, index) => {
          const isCurrent = segment.id === selectedStep?.id;

          return (
            <span key={`${segment.id}-${index}`} className="contents">
              {index > 0 ? (
                <BreadcrumbSeparator className="text-muted-foreground/60" />
              ) : null}
              <BreadcrumbSegment
                segment={segment}
                isCurrent={isCurrent}
                onSelect={onSelectStep}
              />
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
