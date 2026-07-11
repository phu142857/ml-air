import type { TraceWaterfallStep } from "@/lib/api";

export type TraceTreeNode = {
  id: string;
  step: TraceWaterfallStep;
  flatIndex: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
};

export type TraceBreadcrumbSegment = {
  id: string;
  label: string;
  step: TraceWaterfallStep | null;
};

const BREADCRUMB_MAX_VISIBLE = 5;

export function stepDepth(step: TraceWaterfallStep, index: number, steps: TraceWaterfallStep[]): number {
  if (step.depth != null) return step.depth;
  if (step.kind === "run") return 0;
  if (step.kind === "task") return 1;
  if (steps.some((s) => s.kind === "run")) return 1;
  return 0;
}

export function buildTraceTreeIndex(steps: TraceWaterfallStep[]): Map<string, TraceTreeNode> {
  const nodes = new Map<string, TraceTreeNode>();
  const parentStack: Array<{ id: string; depth: number }> = [];

  steps.forEach((step, flatIndex) => {
    const depth = stepDepth(step, flatIndex, steps);

    while (parentStack.length > 0 && parentStack[parentStack.length - 1]!.depth >= depth) {
      parentStack.pop();
    }

    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1]!.id : null;
    const node: TraceTreeNode = {
      id: step.id,
      step,
      flatIndex,
      depth,
      parentId,
      childIds: [],
    };
    nodes.set(step.id, node);

    if (parentId) {
      nodes.get(parentId)?.childIds.push(step.id);
    }

    parentStack.push({ id: step.id, depth });
  });

  return nodes;
}

export function getAncestorChain(
  tree: Map<string, TraceTreeNode>,
  stepId: string,
): TraceTreeNode[] {
  const chain: TraceTreeNode[] = [];
  let current = tree.get(stepId);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? tree.get(current.parentId) : undefined;
  }
  return chain;
}

export function collectDescendantIds(
  tree: Map<string, TraceTreeNode>,
  stepId: string,
): Set<string> {
  const hidden = new Set<string>();
  const walk = (id: string) => {
    const node = tree.get(id);
    if (!node) return;
    for (const childId of node.childIds) {
      hidden.add(childId);
      walk(childId);
    }
  };
  walk(stepId);
  return hidden;
}

export function buildSpanBreadcrumb(
  steps: TraceWaterfallStep[],
  selectedStep: TraceWaterfallStep | null,
): TraceBreadcrumbSegment[] {
  if (!selectedStep) return [];

  const tree = buildTraceTreeIndex(steps);
  const chain = getAncestorChain(tree, selectedStep.id);

  const segments: TraceBreadcrumbSegment[] = [
    { id: "__trace__", label: "Trace", step: null },
    ...chain.map((node) => ({
      id: node.id,
      label: node.step.label,
      step: node.step,
    })),
  ];

  return truncateBreadcrumb(segments);
}

export function truncateBreadcrumb(segments: TraceBreadcrumbSegment[]): TraceBreadcrumbSegment[] {
  if (segments.length <= BREADCRUMB_MAX_VISIBLE) return segments;

  const first = segments[0]!;
  const tail = segments.slice(-(BREADCRUMB_MAX_VISIBLE - 2));
  return [first, { id: "__ellipsis__", label: "…", step: null }, ...tail];
}

export function getRelatedSpanIds(
  tree: Map<string, TraceTreeNode>,
  stepId: string,
): Set<string> {
  const related = new Set<string>([stepId]);
  for (const node of getAncestorChain(tree, stepId)) {
    related.add(node.id);
  }
  for (const id of collectDescendantIds(tree, stepId)) {
    related.add(id);
  }
  return related;
}

export function isRowVisible(
  stepId: string,
  collapsedSpanIds: Set<string>,
  tree: Map<string, TraceTreeNode>,
): boolean {
  let current = tree.get(stepId);
  while (current?.parentId) {
    if (collapsedSpanIds.has(current.parentId)) return false;
    current = tree.get(current.parentId);
  }
  return true;
}
