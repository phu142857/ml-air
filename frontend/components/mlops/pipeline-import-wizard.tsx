"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  GitBranch,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { PipelineVisualEditor } from "@/components/mlops/pipeline-visual-editor";
import { normalizePipelineForDag } from "@/lib/adapt-pipeline-dag";
import {
  createPipelineVersionApi,
  fetchModels,
  fetchPlugins,
  putModelPipelineMapping,
  validatePipelineApi,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import {
  PipelineParseError,
  clientValidatePipelineConfig,
  configToPreviewPipeline,
  configToYaml,
  isValidPipelineId,
  parsePipelineBundle,
  parsePipelineFile,
  parsePipelineText,
  parseServerValidateError,
  unknownPlugins,
  type NormalizedPipelineConfig,
  type ClientValidationResult,
} from "@/lib/pipeline";
import { toastError, toastSuccess } from "@/lib/toast-actions";
import { cn, formatApiClientError } from "@/lib/utils";
import { feedbackMessageClass } from "@/lib/status-style";
import { formatVersionLabel } from "@/lib/version-label";

const STEPS = ["Source", "Pipeline ID", "Validate", "Preview & Edit", "Publish", "Model mapping"] as const;

const PIPELINE_SOURCE_EXAMPLES = {
  yaml: `tasks:
  - id: train
    plugin: echo_tracking`,
  json: `{
  "tasks": [
    { "id": "train", "plugin": "echo_tracking" }
  ]
}`,
} as const;

type Props = {
  tenantId: string;
  projectId: string;
  token: string;
  onComplete?: (result: { pipelineId: string; versionId: string; version: number }) => void;
  onCancel?: () => void;
  className?: string;
};

export function PipelineImportWizard({ tenantId, projectId, token, onComplete, onCancel, className }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [sourceText, setSourceText] = useState("");
  const [sourceFormat, setSourceFormat] = useState<"yaml" | "json">("yaml");
  const [sourceError, setSourceError] = useState("");
  const [config, setConfig] = useState<NormalizedPipelineConfig | null>(null);
  const [manifestPipelineId, setManifestPipelineId] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState("");
  const [clientResult, setClientResult] = useState<ClientValidationResult | null>(null);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState("");
  const [unknownPluginNames, setUnknownPluginNames] = useState<string[]>([]);
  const [previewTab, setPreviewTab] = useState<"readonly" | "edit">("readonly");
  const [publishedVersion, setPublishedVersion] = useState<{ versionId: string; version: number } | null>(null);
  const [mappingModelId, setMappingModelId] = useState("");
  const [mappingSaved, setMappingSaved] = useState(false);

  const pluginsQuery = useQuery({
    queryKey: [...mlairKeys.plugins.all(), token],
    queryFn: () => fetchPlugins(token),
    enabled: Boolean(token?.trim()) && step >= 2,
  });

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId, token],
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: Boolean(token?.trim()) && step >= 5,
  });

  const registeredPlugins = useMemo(() => {
    return new Set((pluginsQuery.data?.items || []).map((p) => p.name));
  }, [pluginsQuery.data?.items]);

  const registeredPluginList = useMemo(() => {
    return [...registeredPlugins].sort();
  }, [registeredPlugins]);

  const previewPipeline = useMemo(() => {
    if (!config || !pipelineId.trim()) return null;
    return normalizePipelineForDag(configToPreviewPipeline(pipelineId.trim(), config));
  }, [config, pipelineId]);

  const parseSource = useCallback((): NormalizedPipelineConfig | null => {
    setSourceError("");
    try {
      const parsed = parsePipelineText(sourceText, sourceFormat);
      setConfig(parsed.config);
      if (parsed.manifestPipelineId) {
        setManifestPipelineId(parsed.manifestPipelineId);
        setPipelineId((prev) => prev.trim() || parsed.manifestPipelineId || "");
      }
      return parsed.config;
    } catch (err) {
      const msg = err instanceof PipelineParseError ? err.message : String(err);
      setSourceError(msg);
      return null;
    }
  }, [sourceText, sourceFormat]);

  const runValidations = useCallback(async (): Promise<{ ok: boolean; unknown: string[] }> => {
    if (!config) return { ok: false, unknown: [] };
    const client = clientValidatePipelineConfig(config);
    setClientResult(client);
    if (!client.ok) {
      setServerOk(null);
      setServerError("");
      setUnknownPluginNames([]);
      return { ok: false, unknown: [] };
    }

    const unknown = unknownPlugins(config, registeredPlugins);
    setUnknownPluginNames(unknown);
    if (unknown.length > 0) {
      setServerOk(null);
      setServerError("");
      return { ok: false, unknown };
    }

    try {
      await validatePipelineApi(token, config as Record<string, unknown>, {
        tenantId,
        projectId,
      });
      setServerOk(true);
      setServerError("");
      return { ok: true, unknown: [] };
    } catch (err) {
      setServerOk(false);
      setServerError(parseServerValidateError(err));
      return { ok: false, unknown: [] };
    }
  }, [config, registeredPlugins, token, tenantId, projectId]);

  useEffect(() => {
    if (step !== 2 || !config) return;
    setClientResult(clientValidatePipelineConfig(config));
  }, [step, config]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!config || !pipelineId.trim()) throw new Error("Missing pipeline config or id");
      return createPipelineVersionApi(
        tenantId,
        projectId,
        pipelineId.trim(),
        token,
        config as Record<string, unknown>,
      );
    },
    onSuccess: async (created) => {
      toastSuccess("Pipeline published", `${pipelineId} · ${formatVersionLabel(created.version)}`);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.pipelines.list(tenantId, projectId) });
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId.trim()),
      });
      setPublishedVersion({ versionId: created.version_id, version: created.version });
      setStep(5);
      onComplete?.({
        pipelineId: pipelineId.trim(),
        versionId: created.version_id,
        version: created.version,
      });
    },
    onError: (e: Error) => toastError("Publish failed", formatApiClientError(e)),
  });

  const mappingMutation = useMutation({
    mutationFn: async () => {
      if (!mappingModelId.trim() || !pipelineId.trim()) throw new Error("Select a model");
      return putModelPipelineMapping(tenantId, projectId, mappingModelId.trim(), token, {
        pipeline_id: pipelineId.trim(),
      });
    },
    onSuccess: () => {
      setMappingSaved(true);
      toastSuccess("Model mapping saved", `${mappingModelId} → ${pipelineId}`);
    },
    onError: (e: Error) => toastError("Mapping failed", formatApiClientError(e)),
  });

  const canNextFromSource = sourceText.trim().length > 0;
  const canNextFromId = isValidPipelineId(pipelineId);

  const canNextFromValidate =
    clientResult?.ok === true && serverOk === true && unknownPluginNames.length === 0;

  const handleNext = async () => {
    if (step === 0) {
      const parsed = parseSource();
      if (!parsed) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!canNextFromId) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const result = await runValidations();
      if (result.ok) {
        setStep(3);
      }
      return;
    }
    if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onCancel?.();
      return;
    }
    if (step === 5) return;
    setStep((s) => Math.max(0, s - 1));
  };

  const handleSourceFormatChange = (next: "yaml" | "json") => {
    if (next === sourceFormat) return;
    const trimmed = sourceText.trim();
    const previousExample = PIPELINE_SOURCE_EXAMPLES[sourceFormat];
    if (!trimmed || trimmed === previousExample) {
      setSourceText(PIPELINE_SOURCE_EXAMPLES[next]);
    }
    setSourceFormat(next);
    setSourceError("");
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setSourceError("");
    try {
      const parsed = await parsePipelineFile(file);
      setSourceText(await file.text());
      setSourceFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "yaml");
      setConfig(parsed.config);
      if (parsed.manifestPipelineId) {
        setManifestPipelineId(parsed.manifestPipelineId);
        setPipelineId((prev) => prev.trim() || parsed.manifestPipelineId || "");
      }
    } catch (err) {
      setSourceError(err instanceof PipelineParseError ? err.message : String(err));
    }
  };

  const onBundleChange = async (file: File | null) => {
    if (!file) return;
    setSourceError("");
    try {
      const parsed = await parsePipelineBundle(file);
      setSourceText(configToYaml(parsed.config));
      setSourceFormat("yaml");
      setConfig(parsed.config);
      if (parsed.manifestPipelineId) {
        setManifestPipelineId(parsed.manifestPipelineId);
        setPipelineId((prev) => prev.trim() || parsed.manifestPipelineId || "");
      }
    } catch (err) {
      setSourceError(err instanceof PipelineParseError ? err.message : String(err));
    }
  };

  const exportYaml = () => {
    if (!config) return;
    const blob = new Blob([configToYaml(config)], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pipelineId.trim() || "pipeline"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-6", className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn(
              "rounded-full border px-2.5 py-1",
              i === step
                ? "border-primary/40 bg-primary/10 text-foreground"
                : i < step
                  ? "border-border text-foreground/80"
                  : "border-border/60",
            )}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,.json"
              className="hidden"
              onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
            />
            <input
              ref={bundleInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => void onBundleChange(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload YAML / JSON
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => bundleInputRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              Upload bundle (.zip)
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-muted/10">
            <Tabs
              value={sourceFormat}
              onValueChange={(value) => handleSourceFormatChange(value as "yaml" | "json")}
            >
              <div className="flex border-b border-border bg-muted/30 px-2 py-1.5">
                <TabsList className="h-8 bg-transparent p-0">
                  <TabsTrigger value="yaml" className="h-7 px-3 text-xs">
                    YAML
                  </TabsTrigger>
                  <TabsTrigger value="json" className="h-7 px-3 text-xs">
                    JSON
                  </TabsTrigger>
                </TabsList>
              </div>
              <Textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="min-h-[220px] resize-y rounded-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                placeholder={PIPELINE_SOURCE_EXAMPLES[sourceFormat]}
                spellCheck={false}
              />
            </Tabs>
          </div>
          {sourceError ? <p className={cn("text-sm", feedbackMessageClass("failed"))}>{sourceError}</p> : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose a unique pipeline identifier for this project. Published versions are immutable under this id.
          </p>
          {manifestPipelineId ? (
            <p className="text-xs text-muted-foreground">
              Manifest suggested: <span className="font-mono text-foreground">{manifestPipelineId}</span>
            </p>
          ) : null}
          <label className="block text-xs text-muted-foreground">
            Pipeline ID
            <input
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-sm"
              placeholder="demo_train_pipeline"
            />
          </label>
          {!pipelineId.trim() || isValidPipelineId(pipelineId) ? null : (
            <p className={cn("text-sm", feedbackMessageClass("failed"))}>
              Use letters, numbers, underscore, hyphen; must start with a letter.
            </p>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Button type="button" size="sm" variant="outline" onClick={() => void runValidations()} disabled={!config}>
            Run validation
          </Button>
          {clientResult ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                {clientResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--status-success-fg)]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[color:var(--status-failed-fg)]" />
                )}
                Client validation {clientResult.ok ? "passed" : "failed"}
              </div>
              {clientResult.errors.map((e) => (
                <p key={`${e.code}-${e.message}`} className={cn("text-sm", feedbackMessageClass("failed"))}>
                  {e.message}
                </p>
              ))}
            </div>
          ) : null}
          {serverOk === true ? (
            <p className="text-sm text-[color:var(--status-success-fg)]">Server validation passed.</p>
          ) : null}
          {serverError ? <p className={cn("text-sm", feedbackMessageClass("failed"))}>{serverError}</p> : null}
          {unknownPluginNames.length > 0 ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="mb-2 flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Plugin{unknownPluginNames.length > 1 ? "s" : ""}{" "}
                  <span className="font-mono">{unknownPluginNames.join(", ")}</span> not registered in this Hub.
                  Install the plugin package into the API image and rebuild before publishing.
                </span>
              </p>
              {registeredPluginList.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Registered plugins:{" "}
                  <span className="font-mono">{registeredPluginList.join(", ")}</span>
                </p>
              ) : pluginsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading plugin registry…</p>
              ) : (
                <p className="text-xs text-muted-foreground">No plugins in registry.</p>
              )}
            </div>
          ) : null}
          {registeredPluginList.length > 0 && unknownPluginNames.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Registry: <span className="font-mono">{registeredPluginList.join(", ")}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 3 && config && pipelineId.trim() ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Preview or edit DAG for <span className="font-mono text-foreground">{pipelineId}</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={previewTab === "readonly" ? "default" : "outline"}
                onClick={() => setPreviewTab("readonly")}
              >
                Read-only
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewTab === "edit" ? "default" : "outline"}
                onClick={() => setPreviewTab("edit")}
              >
                Visual editor
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={exportYaml}>
                Export YAML
              </Button>
            </div>
          </div>
          {previewTab === "readonly" && previewPipeline ? (
            <div className="min-h-[280px] rounded-xl border border-border/70 bg-muted/10 p-2">
              <PipelineDAG pipeline={previewPipeline} />
            </div>
          ) : (
            <PipelineVisualEditor
              pipelineId={pipelineId.trim()}
              config={config}
              onChange={(next) => {
                setConfig(next);
                setClientResult(null);
                setServerOk(null);
                setServerError("");
                setUnknownPluginNames([]);
              }}
            />
          )}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <GitBranch className="h-4 w-4" />
              Ready to publish
            </div>
            <ul className="list-inside list-disc text-muted-foreground">
              <li>
                Pipeline: <span className="font-mono text-foreground">{pipelineId}</span>
              </li>
              <li>
                Tasks: <span className="font-mono text-foreground">{config?.tasks.length ?? 0}</span>
              </li>
            </ul>
          </div>
          <Button
            type="button"
            className="gap-2"
            disabled={publishMutation.isPending}
            onClick={() => void publishMutation.mutateAsync()}
          >
            {publishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publish version
          </Button>
        </div>
      ) : null}

      {step === 5 && publishedVersion ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)]/30 p-4 text-sm">
            <p className="font-medium text-foreground">
              Published {pipelineId} · {formatVersionLabel(publishedVersion.version)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Optionally set this pipeline as the default for a model (used when triggering runs from Model + Dataset).
            </p>
          </div>
          <label className="block text-xs text-muted-foreground">
            Model
            <select
              value={mappingModelId}
              onChange={(e) => setMappingModelId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
              disabled={modelsQuery.isLoading || mappingSaved}
            >
              <option value="">Skip — no default mapping</option>
              {(modelsQuery.data?.items || []).map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.name || m.model_id}
                </option>
              ))}
            </select>
          </label>
          {mappingModelId.trim() ? (
            <Button
              type="button"
              size="sm"
              disabled={mappingMutation.isPending || mappingSaved}
              onClick={() => void mappingMutation.mutateAsync()}
            >
              {mappingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as default pipeline
            </Button>
          ) : null}
          {mappingSaved ? (
            <p className="text-sm text-[color:var(--status-success-fg)]">Default pipeline mapping saved.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
        <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={step === 5}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 4 ? (
          <Button
            type="button"
            size="sm"
            disabled={
              (step === 0 && !canNextFromSource) ||
              (step === 1 && !canNextFromId) ||
              (step === 2 && !canNextFromValidate) ||
              publishMutation.isPending
            }
            onClick={() => void handleNext()}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : step === 4 ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(`/pipelines/${encodeURIComponent(pipelineId.trim())}`)}
          >
            Open pipeline
          </Button>
        )}
      </div>
    </div>
  );
}
