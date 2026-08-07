"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";

import { ControlPlaneDisabled } from "@/components/mlops/control-plane/disabled-state";
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import {
  approvePromptVersion,
  createPrompt,
  createPromptVersion,
  deployPromptVersion,
  fetchPromptVersions,
  fetchPrompts,
} from "@/lib/control-plane-api";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { useControlPlaneFeatures } from "@/lib/use-control-plane-features";
import { formatApiClientError } from "@/lib/utils";

export default function PromptsPage() {
  const { tenantId, projectId, token } = useAppContext();
  const flags = useControlPlaneFeatures();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState("You are a helpful ML assistant.");

  const promptsQ = useQuery({
    queryKey: mlairKeys.controlPlane.prompts(tenantId, projectId),
    queryFn: () => fetchPrompts(tenantId, projectId, token),
    enabled: scopePinned && flags.promptManagement,
  });
  const versionsQ = useQuery({
    queryKey: mlairKeys.controlPlane.promptVersions(tenantId, projectId, selectedPromptId || ""),
    queryFn: () => fetchPromptVersions(tenantId, projectId, selectedPromptId!, token),
    enabled: scopePinned && flags.promptManagement && Boolean(selectedPromptId),
  });

  const createPromptM = useMutation({
    mutationFn: () => createPrompt(tenantId, projectId, token, { name }),
    onSuccess: (p) => {
      setSelectedPromptId(p.prompt_id);
      void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.prompts(tenantId, projectId) });
    },
  });

  const createVersionM = useMutation({
    mutationFn: () => createPromptVersion(tenantId, projectId, selectedPromptId!, token, { content: versionContent }),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: mlairKeys.controlPlane.promptVersions(tenantId, projectId, selectedPromptId!),
      }),
  });

  const approveM = useMutation({
    mutationFn: (versionId: string) => approvePromptVersion(tenantId, projectId, versionId, token),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: mlairKeys.controlPlane.promptVersions(tenantId, projectId, selectedPromptId!),
      }),
  });

  const deployM = useMutation({
    mutationFn: (versionId: string) => deployPromptVersion(tenantId, projectId, versionId, token),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: mlairKeys.controlPlane.promptVersions(tenantId, projectId, selectedPromptId!),
      }),
  });

  if (!flags.promptManagement) {
    return <div className="p-6"><ControlPlaneDisabled feature="Prompt Management" envVar="ML_AIR_PROMPT_MANAGEMENT" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={FileText} accent="sky" title="Prompts" />
      <div className="shrink-0 page-toolbar">{!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : null}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6 grid gap-6 lg:grid-cols-2">
        {!scopePinned ? (
          <MlopsEmptyState icon={FileText} title="Pin a project" description="Quản lý prompt theo project." />
        ) : (
          <>
            <section className="space-y-3 rounded-lg border border-border/60 p-4">
              <h2 className="text-sm font-semibold">Prompts</h2>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prompt name" className="h-8 text-xs" />
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => createPromptM.mutate()} disabled={!name || createPromptM.isPending}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
              {promptsQ.isError ? <p className="text-xs text-destructive">{formatApiClientError(promptsQ.error)}</p> : null}
              <ul className="text-xs space-y-1">
                {(promptsQ.data?.items || []).map((p) => (
                  <li key={p.prompt_id}>
                    <button
                      type="button"
                      className={`w-full text-left rounded px-2 py-1 hover:bg-muted/60 ${selectedPromptId === p.prompt_id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedPromptId(p.prompt_id)}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3 rounded-lg border border-border/60 p-4">
              <h2 className="text-sm font-semibold">Versions</h2>
              {!selectedPromptId ? (
                <p className="text-xs text-muted-foreground">Chọn một prompt.</p>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Content</Label>
                    <Textarea value={versionContent} onChange={(e) => setVersionContent(e.target.value)} className="text-xs min-h-[120px] mt-1" />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => createVersionM.mutate()} disabled={createVersionM.isPending}>
                    Add version
                  </Button>
                  <ul className="text-xs space-y-2">
                    {(versionsQ.data?.items || []).map((v) => (
                      <li key={v.version_id} className="border border-border/40 rounded p-2">
                        <div className="flex justify-between items-center mb-1">
                          <span>v{v.version_num} · {v.status}</span>
                          <div className="flex gap-1">
                            {v.status === "draft" ? (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => approveM.mutate(v.version_id)}>Approve</Button>
                            ) : null}
                            {v.status === "approved" ? (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => deployM.mutate(v.version_id)}>Deploy</Button>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-muted-foreground line-clamp-3">{v.content}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
