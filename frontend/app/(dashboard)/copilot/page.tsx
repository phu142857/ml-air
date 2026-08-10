"use client";

import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { ControlPlaneDisabled } from "@/components/mlops/control-plane/disabled-state";
import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import { copilotSuggest } from "@/lib/control-plane-api";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { useControlPlaneFeatures } from "@/lib/use-control-plane-features";
import { formatApiClientError } from "@/lib/utils";

const ACTIONS = [
  { id: "explain_failure", label: "Explain failure" },
  { id: "generate_pipeline", label: "Generate pipeline" },
  { id: "generate_prompt", label: "Generate prompt" },
  { id: "suggest_hyperparameters", label: "Suggest hyperparameters" },
  { id: "dataset_analysis", label: "Dataset analysis" },
  { id: "run_summary", label: "Run summary" },
];

export default function CopilotPage() {
  const { tenantId, projectId, token } = useAppContext();
  const flags = useControlPlaneFeatures();
  const scopePinned = isScopePinned(tenantId, projectId);

  const [action, setAction] = useState("explain_failure");
  const [contextJson, setContextJson] = useState('{"error": "CUDA OOM", "status": "FAILED"}');
  const [result, setResult] = useState("");

  const suggestM = useMutation({
    mutationFn: () => {
      let context: Record<string, unknown> = {};
      try {
        context = JSON.parse(contextJson) as Record<string, unknown>;
      } catch {
        context = { raw: contextJson };
      }
      return copilotSuggest(tenantId, projectId, token, { action, context });
    },
    onSuccess: (data) => setResult(JSON.stringify(data, null, 2)),
  });

  if (!flags.copilot) {
    return <div className="p-6"><ControlPlaneDisabled feature="AI Copilot" envVar="ML_AIR_COPILOT" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Sparkles} accent="zinc" title="AI Copilot" />
      <PageScrollBody
        className="max-w-3xl"
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : undefined}
      >
        {!scopePinned ? (
          <MlopsEmptyState icon={Sparkles} title="Pin a project" description="Copilot runs in project scope." />
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {ACTIONS.map((a) => (
                <Button key={a.id} size="sm" variant={action === a.id ? "default" : "outline"} className="h-7 text-xs" onClick={() => setAction(a.id)}>
                  {a.label}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-xs">Context (JSON)</Label>
              <Textarea value={contextJson} onChange={(e) => setContextJson(e.target.value)} className="text-xs font-mono min-h-[120px] mt-1" />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={() => suggestM.mutate()} disabled={suggestM.isPending}>
              {suggestM.isPending ? "Thinking…" : "Ask Copilot"}
            </Button>
            {suggestM.isError ? <p className="text-xs text-destructive">{formatApiClientError(suggestM.error)}</p> : null}
            {result ? <pre className="panel-surface overflow-auto p-3 text-xs">{result}</pre> : null}
          </>
        )}
      </PageScrollBody>
    </div>
  );
}
