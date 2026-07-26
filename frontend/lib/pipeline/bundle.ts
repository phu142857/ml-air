import JSZip from "jszip";
import { load as loadYaml } from "js-yaml";
import { PipelineParseError } from "./parse";
import { normalizePipelineConfig } from "./normalize";
import type { NormalizedPipelineConfig, ParsedPipelineSource } from "./types";

function parseYamlText(text: string): unknown {
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

function findZipFile(zip: JSZip, pattern: RegExp): JSZip.JSZipObject | null {
  const matches = Object.keys(zip.files).filter((name) => pattern.test(name) && !zip.files[name].dir);
  if (!matches.length) return null;
  matches.sort();
  return zip.file(matches[0]);
}

async function readZipText(entry: JSZip.JSZipObject | null): Promise<string | null> {
  if (!entry) return null;
  return entry.async("string");
}

export async function parsePipelineBundle(file: File): Promise<ParsedPipelineSource> {
  const buffer = await file.arrayBuffer();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PipelineParseError("Invalid zip bundle");
  }

  const manifestEntry =
    zip.file("manifest.yaml") ||
    zip.file("manifest.yml") ||
    findZipFile(zip, /(^|\/)manifest\.ya?ml$/i);
  if (!manifestEntry) {
    throw new PipelineParseError("Bundle must include manifest.yaml at the root");
  }

  const manifestText = await readZipText(manifestEntry);
  if (!manifestText?.trim()) {
    throw new PipelineParseError("manifest.yaml is empty");
  }

  const manifestRaw = parseYamlText(manifestText);
  if (!manifestRaw || typeof manifestRaw !== "object" || Array.isArray(manifestRaw)) {
    throw new PipelineParseError("manifest.yaml must be an object");
  }
  const manifest = manifestRaw as Record<string, unknown>;

  let config: NormalizedPipelineConfig;
  let manifestPipelineId =
    typeof manifest.pipeline_id === "string" && manifest.pipeline_id.trim()
      ? manifest.pipeline_id.trim()
      : undefined;

  if (manifest.config && typeof manifest.config === "object" && !Array.isArray(manifest.config)) {
    config = normalizePipelineConfig(manifest.config);
  } else {
    const configFile =
      typeof manifest.config_file === "string" && manifest.config_file.trim()
        ? manifest.config_file.trim()
        : null;
    const configEntry =
      (configFile ? zip.file(configFile) : null) ||
      findZipFile(zip, /(^|\/)pipeline\/[^/]+\.ya?ml$/i);
    const configText = await readZipText(configEntry);
    if (!configText?.trim()) {
      throw new PipelineParseError(
        "Bundle manifest must include config or config_file pointing to a YAML file in the archive",
      );
    }
    const configRaw = parseYamlText(configText);
    if (!configRaw || typeof configRaw !== "object" || Array.isArray(configRaw)) {
      throw new PipelineParseError("Pipeline config file must be a YAML object");
    }
    const configObj = configRaw as Record<string, unknown>;
    if (configObj.config && typeof configObj.config === "object" && !Array.isArray(configObj.config)) {
      config = normalizePipelineConfig(configObj.config);
      manifestPipelineId =
        manifestPipelineId ||
        (typeof configObj.pipeline_id === "string" ? configObj.pipeline_id.trim() : undefined);
    } else {
      config = normalizePipelineConfig(configObj);
    }
  }

  return {
    format: "yaml",
    raw: manifestRaw,
    config,
    manifestPipelineId,
  };
}
