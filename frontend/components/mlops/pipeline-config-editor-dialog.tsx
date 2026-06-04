"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createPipelineVersionApi,
  fetchPipelineVersions,
  type PipelineVersionItem,
} from "@/lib/api";
import { pickLatestPipelineVersion } from "@/lib/pipeline-config";
import { mlairKeys } from "@/lib/query-keys";
import { formatDateTimeCompact } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  pipelineId: string;
  token: string;
  /** When set, load this version; otherwise latest. */
  versionId?: string | null;
  /** Allow saving as a new immutable version. */
  allowCreateVersion?: boolean;
  /** Seed JSON for create flow (Versions page) before a version row is selected. */
  seedJson?: string | null;
};

export function PipelineConfigEditorDialog({
  open,
  onOpenChange,
  tenantId,
  projectId,
  pipelineId,
  token,
  versionId,
  allowCreateVersion = false,
  seedJson,
}: Props) {
  const qc = useQueryClient();
  const [jsonText, setJsonText] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  const versionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, pipelineId, token),
    enabled: open && Boolean(token?.trim() && pipelineId),
  });

  const items = versionsQuery.data?.items ?? [];
  const latest = useMemo(() => pickLatestPipelineVersion(items), [items]);

  useEffect(() => {
    if (!open) return;
    if (allowCreateVersion) {
      setSelectedVersionId("");
      setJsonText(seedJson?.trim() ? seedJson : "{}");
      setSaveErr("");
      return;
    }
    if (!items.length) return;
    const preferred = versionId && items.some((v) => v.version_id === versionId) ? versionId : latest?.version_id;
    if (preferred) setSelectedVersionId(preferred);
  }, [open, items, versionId, latest?.version_id, allowCreateVersion, seedJson]);

  const activeVersion: PipelineVersionItem | null = useMemo(() => {
    if (!selectedVersionId) return null;
    return items.find((v) => v.version_id === selectedVersionId) ?? null;
  }, [items, selectedVersionId]);

  useEffect(() => {
    if (!open || allowCreateVersion) return;
    if (!activeVersion && latest) {
      setJsonText(JSON.stringify(latest.config ?? {}, null, 2));
      setSaveErr("");
      return;
    }
    if (!activeVersion) return;
    setJsonText(JSON.stringify(activeVersion.config ?? {}, null, 2));
    setSaveErr("");
  }, [open, allowCreateVersion, activeVersion?.version_id, latest?.version_id]);

  useEffect(() => {
    if (!open || !allowCreateVersion || !activeVersion) return;
    setJsonText(JSON.stringify(activeVersion.config ?? {}, null, 2));
    setSaveErr("");
  }, [open, allowCreateVersion, activeVersion?.version_id]);

  const createMut = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        throw new Error("Invalid JSON");
      }
      return createPipelineVersionApi(tenantId, projectId, pipelineId, token, config);
    },
    onSuccess: async () => {
      setSaveErr("");
      await qc.invalidateQueries({ queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId) });
      onOpenChange(false);
    },
    onError: (e: Error) => setSaveErr(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col border-border bg-card sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {allowCreateVersion ? "Publish pipeline config" : "Pipeline config"} · {pipelineId}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {allowCreateVersion ? (
              <span>New immutable version from the JSON below.</span>
            ) : activeVersion ? (
              `Version v${activeVersion.version} · ${formatDateTimeCompact(activeVersion.created_at)} · ${activeVersion.version_id}`
            ) : (
              "Loading versions…"
            )}
            {latest ? (
              <span className="mt-1 block text-[11px]">
                Runs use the <strong>latest</strong> config version (v{latest.version}) unless a run pins an older version.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {allowCreateVersion ? "Copy from version (optional)" : "Config version"}
            </span>
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="max-w-md inset-surface px-2 py-1.5 font-mono text-xs text-foreground"
              aria-label="Pipeline config version"
            >
              {allowCreateVersion ? <option value="">— new draft —</option> : null}
              {items.map((v) => (
                <option key={v.version_id} value={v.version_id}>
                  v{v.version}
                  {v.version_id === latest?.version_id ? " (latest)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <textarea
          className="min-h-[min(50vh,420px)] w-full flex-1 resize-y inset-surface p-3 font-mono text-xs leading-relaxed text-foreground"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          readOnly={!allowCreateVersion}
          spellCheck={false}
        />

        {saveErr ? <p className="text-xs text-[color:var(--status-failed-fg)]">{saveErr}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {allowCreateVersion ? (
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Publishing…" : "Publish as new version"}
            </Button>
          ) : (
            <p className="mr-auto text-[11px] text-muted-foreground">
              Config versions are immutable — use Versions page to publish a new snapshot.
            </p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
