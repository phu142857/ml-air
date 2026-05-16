/** Layered DAG layout for React Flow (left → right by dependency depth). */

export type DagEdge = { source: string; target: string };

const DEFAULT_LAYER_GAP = 280;
const DEFAULT_NODE_GAP = 110;
const DEFAULT_NODE_HEIGHT = 88;

function layerDepth(nodeIds: string[], edges: DagEdge[]): Map<string, number> {
  const depth = new Map<string, number>();
  const incoming = new Map<string, Set<string>>();
  for (const id of nodeIds) incoming.set(id, new Set());
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, new Set());
    incoming.get(e.target)!.add(e.source);
  }
  let frontier = nodeIds.filter((id) => (incoming.get(id)?.size ?? 0) === 0);
  if (!frontier.length) frontier = [...nodeIds];
  let d = 0;
  const seen = new Set<string>();
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      depth.set(id, d);
      for (const e of edges) {
        if (e.source === id && !seen.has(e.target)) next.push(e.target);
      }
    }
    frontier = [...new Set(next)];
    d++;
  }
  let i = 0;
  for (const id of nodeIds) {
    if (!depth.has(id)) depth.set(id, d + (i++ % 3));
  }
  return depth;
}

export function layoutDagPositions(
  nodeIds: string[],
  edges: DagEdge[],
  options?: { layerGap?: number; nodeGap?: number },
): Record<string, { x: number; y: number }> {
  const layerGap = options?.layerGap ?? DEFAULT_LAYER_GAP;
  const nodeGap = options?.nodeGap ?? DEFAULT_NODE_GAP;
  const layers = layerDepth(nodeIds, edges);
  const byLayer = new Map<number, string[]>();
  for (const id of nodeIds) {
    const L = layers.get(id) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L)!.push(id);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [L, list] of byLayer) {
    const sorted = [...list].sort((a, b) => a.localeCompare(b));
    sorted.forEach((id, i) => {
      pos[id] = { x: L * layerGap, y: i * nodeGap };
    });
  }
  return pos;
}

export function estimateDagCanvasHeight(
  nodeIds: string[],
  edges: DagEdge[],
  options?: { nodeGap?: number; nodeHeight?: number; minHeight?: number },
): number {
  const nodeGap = options?.nodeGap ?? DEFAULT_NODE_GAP;
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const minHeight = options?.minHeight ?? 240;
  const layers = layerDepth(nodeIds, edges);
  const byLayer = new Map<number, number>();
  for (const id of nodeIds) {
    const L = layers.get(id) ?? 0;
    byLayer.set(L, (byLayer.get(L) ?? 0) + 1);
  }
  const maxInLayer = Math.max(1, ...byLayer.values());
  return Math.max(minHeight, maxInLayer * nodeGap + nodeHeight + 48);
}

/** Truncate display label; full string goes to tooltip/title. */
export function truncateDagLabel(label: string, maxLen = 22): string {
  const s = label.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}
