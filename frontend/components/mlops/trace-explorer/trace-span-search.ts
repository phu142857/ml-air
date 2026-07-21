import type { TraceWaterfallStep } from "@/lib/api";

export const SPAN_SEARCH_DEBOUNCE_MS = 150;

export type SpanSearchField = "label" | "service" | "status" | "attribute" | "id";

export type SpanSearchResult = {
  stepId: string;
  score: number;
  fields: SpanSearchField[];
};

function stringifyAttributeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeStatusToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function scoreSpanSearch(step: TraceWaterfallStep, query: string): SpanSearchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const q = trimmed.toLowerCase();
  const fields: SpanSearchField[] = [];
  let score = 0;

  if (includesInsensitive(step.label, trimmed)) {
    fields.push("label");
    score += 100;
  }

  if (includesInsensitive(step.id, trimmed)) {
    fields.push("id");
    score += 90;
  }

  if (step.service && includesInsensitive(step.service, trimmed)) {
    fields.push("service");
    score += 80;
  }

  const normalizedStatus = normalizeStatusToken(step.status);
  const normalizedQuery = normalizeStatusToken(trimmed);
  if (
    normalizedStatus === normalizedQuery ||
    normalizedStatus.includes(normalizedQuery) ||
    includesInsensitive(step.status, trimmed)
  ) {
    fields.push("status");
    score += 70;
  }

  const attrs = step.attributes ?? {};
  for (const [key, value] of Object.entries(attrs)) {
    if (includesInsensitive(key, trimmed)) {
      fields.push("attribute");
      score += 50;
      break;
    }
    if (includesInsensitive(stringifyAttributeValue(value), trimmed)) {
      fields.push("attribute");
      score += 40;
      break;
    }
  }

  if (!fields.length) return null;

  return { stepId: step.id, score, fields };
}

export function searchSpans(
  steps: TraceWaterfallStep[],
  query: string,
): SpanSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: SpanSearchResult[] = [];
  for (const step of steps) {
    const hit = scoreSpanSearch(step, trimmed);
    if (hit) results.push(hit);
  }

  return results.sort((a, b) => b.score - a.score || 0);
}

export function buildSpanSearchMatchSet(
  steps: TraceWaterfallStep[],
  query: string,
): {
  matchIds: Set<string>;
  orderedMatchIds: string[];
  resultsByStepId: Map<string, SpanSearchResult>;
} {
  const results = searchSpans(steps, query);
  const matchIds = new Set<string>();
  const orderedMatchIds: string[] = [];
  const resultsByStepId = new Map<string, SpanSearchResult>();

  const stepOrder = new Map(steps.map((step, index) => [step.id, index]));

  const sorted = [...results].sort((a, b) => {
    const orderA = stepOrder.get(a.stepId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = stepOrder.get(b.stepId) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return b.score - a.score;
  });

  for (const result of sorted) {
    matchIds.add(result.stepId);
    orderedMatchIds.push(result.stepId);
    resultsByStepId.set(result.stepId, result);
  }

  return { matchIds, orderedMatchIds, resultsByStepId };
}
