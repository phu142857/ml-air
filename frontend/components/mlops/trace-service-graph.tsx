"use client";

import { cn } from "@/lib/utils";
import type { TraceServiceGraph } from "@/lib/api";

export function TraceServiceGraphView({
  graph,
  className,
}: {
  graph: TraceServiceGraph | null | undefined;
  className?: string;
}) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  if (!nodes.length) {
    return <p className="text-sm text-muted-foreground">No service dependencies recorded for this trace.</p>;
  }

  const nodeSet = new Set(nodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground"
          >
            {node.label}
          </div>
        ))}
      </div>
      {visibleEdges.length ? (
        <div className="space-y-2">
          {visibleEdges.map((edge) => (
            <div
              key={`${edge.from}-${edge.to}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-xs"
            >
              <span className="font-mono text-foreground">{edge.from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-foreground">{edge.to}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{edge.count} calls</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Single-service trace (no cross-service edges).</p>
      )}
    </div>
  );
}
