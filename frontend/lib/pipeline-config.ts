import type { PipelineVersionItem } from "@/lib/api";

export function pickLatestPipelineVersion(items: PipelineVersionItem[]): PipelineVersionItem | null {
  if (!items.length) return null;
  return items.reduce((a, b) => (a.version >= b.version ? a : b));
}

export type PipelineInputRow = {
  dataset: string;
  required_size: number;
};

export function parsePipelineInputs(config: Record<string, unknown> | undefined): PipelineInputRow[] {
  const raw = config?.inputs;
  if (!Array.isArray(raw)) return [];
  const out: PipelineInputRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const dataset = String(row.dataset || "").trim();
    if (!dataset) continue;
    const req = Number(row.required_size);
    out.push({
      dataset,
      required_size: Number.isFinite(req) && req > 0 ? Math.floor(req) : 0,
    });
  }
  return out;
}
