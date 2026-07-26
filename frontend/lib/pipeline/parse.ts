import { load as loadYaml } from "js-yaml";
import { normalizePipelineConfig } from "./normalize";
import type { NormalizedPipelineConfig, ParsedPipelineSource } from "./types";

export class PipelineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineParseError";
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PipelineParseError("Invalid JSON syntax");
  }
}

function parseYaml(text: string): unknown {
  try {
    const doc = loadYaml(text);
    if (doc === null || doc === undefined) {
      throw new PipelineParseError("YAML document is empty");
    }
    return doc;
  } catch (err) {
    if (err instanceof PipelineParseError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new PipelineParseError(`Invalid YAML syntax: ${msg}`);
  }
}

function extractConfigDocument(raw: unknown): { config: NormalizedPipelineConfig; manifestPipelineId?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PipelineParseError("Pipeline config must be a JSON/YAML object");
  }
  const obj = raw as Record<string, unknown>;

  // Future bundle manifest: { pipeline_id, config: { tasks, ... } }
  if (obj.config && typeof obj.config === "object" && !Array.isArray(obj.config)) {
    const manifestPipelineId =
      typeof obj.pipeline_id === "string" && obj.pipeline_id.trim() ? obj.pipeline_id.trim() : undefined;
    return {
      config: normalizePipelineConfig(obj.config),
      manifestPipelineId,
    };
  }

  return { config: normalizePipelineConfig(obj) };
}

export function parsePipelineText(text: string, format: "yaml" | "json" = "yaml"): ParsedPipelineSource {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new PipelineParseError("Pipeline file is empty");
  }
  const raw = format === "json" ? parseJson(trimmed) : parseYaml(trimmed);
  const { config, manifestPipelineId } = extractConfigDocument(raw);
  return { format, raw, config, manifestPipelineId };
}

export function parsePipelineFile(file: File): Promise<ParsedPipelineSource> {
  return file.text().then((text) => {
    const name = file.name.toLowerCase();
    const format: "yaml" | "json" = name.endsWith(".json") ? "json" : "yaml";
    return parsePipelineText(text, format);
  });
}

export function detectFormatFromFilename(filename: string): "yaml" | "json" {
  return filename.toLowerCase().endsWith(".json") ? "json" : "yaml";
}
