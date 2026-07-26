/** Normalized pipeline version config (immutable publish payload). */

export type PipelineTaskConfig = {
  id: string;
  plugin?: string;
  depends_on?: string[];
  type?: string;
  http?: Record<string, unknown>;
  plugin_version?: string;
  requires_plugin_version?: string;
  [key: string]: unknown;
};

export type PipelineInputConfig = {
  dataset: string;
  required_size?: number;
  [key: string]: unknown;
};

export type NormalizedPipelineConfig = {
  tasks: PipelineTaskConfig[];
  inputs?: PipelineInputConfig[];
  [key: string]: unknown;
};

export type ClientValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  taskId?: string;
};

export type ClientValidationResult = {
  ok: boolean;
  errors: ClientValidationIssue[];
  warnings: ClientValidationIssue[];
};

export type ParsedPipelineSource = {
  format: "yaml" | "json";
  /** Raw document before normalize (for debugging). */
  raw: unknown;
  config: NormalizedPipelineConfig;
  /** Present when importing a future bundle manifest. */
  manifestPipelineId?: string;
};
