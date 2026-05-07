"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  deleteModel,
  deleteModelVersion,
  fetchModels,
  fetchModelServing,
  fetchModelStatus,
  fetchModelTriggerPolicy,
  fetchModelVersions,
  fetchRun,
  promoteModelVersion,
  setModelServingSlot,
  updateModelVersionApproval,
  updateModelTriggerPolicy
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { modelApprovalPillClass } from "@/lib/model-governance-ui";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";

/** Set `true` when serving slot routes are re-enabled in `api/app/api/routes/v1.py`. */
const ENABLE_SERVING_SLOTS_UI = false;

const SERVING_SLOTS = ["champion", "candidate", "challenger", "canary"] as const;

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = params.modelId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [stageFilter, setStageFilter] = useState("all");
  const [triggerMode, setTriggerMode] = useState<"manual" | "auto_ready" | "schedule">("manual");
  const [debounceMinutes, setDebounceMinutes] = useState("10");
  const [scheduleCron, setScheduleCron] = useState("0 */6 * * *");
  const [policyMsg, setPolicyMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmBody, setConfirmBody] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [versionBanner, setVersionBanner] = useState("");
  const [servingSlotDraft, setServingSlotDraft] = useState<Record<string, string>>({});

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });
  const versionsQuery = useQuery({
    queryKey: mlairKeys.models.versions(tenantId, projectId, modelId),
    queryFn: () => fetchModelVersions(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });
  const modelStatusQuery = useQuery({
    queryKey: mlairKeys.models.status(tenantId, projectId, modelId),
    queryFn: () => fetchModelStatus(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });
  const recentRunsQuery = useQuery({
    queryKey: mlairKeys.models.recentRuns(
      tenantId,
      projectId,
      modelId,
      (versionsQuery.data?.items || []).map((v) => v.run_id).join(",")
    ),
    queryFn: async () => {
      const ids = (versionsQuery.data?.items || [])
        .map((v) => String(v.run_id || "").trim())
        .filter(Boolean)
        .slice(0, 5);
      const rows = await Promise.all(ids.map((id) => fetchRun(tenantId, projectId, id, token).catch(() => null)));
      return rows.filter(Boolean) as Array<any>;
    },
    enabled: !!versionsQuery.data?.items?.length,
    ...realtimeFallbackPolling()
  });

  const triggerPolicyQuery = useQuery({
    queryKey: mlairKeys.models.triggerPolicy(tenantId, projectId, modelId),
    queryFn: () => fetchModelTriggerPolicy(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });

  useEffect(() => {
    if (!triggerPolicyQuery.data) return;
    setTriggerMode(triggerPolicyQuery.data.trigger_mode);
    setDebounceMinutes(String(triggerPolicyQuery.data.debounce_minutes || 10));
    setScheduleCron(triggerPolicyQuery.data.schedule_cron || "0 */6 * * *");
  }, [triggerPolicyQuery.data]);

  useEffect(() => {
    setServingSlotDraft({});
    setVersionBanner("");
  }, [modelId]);

  const model = useMemo(() => modelsQuery.data?.items.find((x) => x.model_id === modelId) ?? null, [modelsQuery.data, modelId]);

  const versions = useMemo(() => {
    const items = versionsQuery.data?.items ?? [];
    if (stageFilter === "all") return items;
    return items.filter((v) => v.stage === stageFilter);
  }, [versionsQuery.data, stageFilter]);

  const promoteMutation = useMutation({
    mutationFn: ({ version, stage }: { version: number; stage: string }) =>
      promoteModelVersion(tenantId, projectId, modelId, token, { version, stage }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const servingQuery = useQuery({
    queryKey: mlairKeys.models.serving(tenantId, projectId, modelId),
    queryFn: () => fetchModelServing(tenantId, projectId, modelId, token),
    enabled: ENABLE_SERVING_SLOTS_UI && Boolean(modelId && token && projectId !== "all"),
    ...realtimeFallbackPolling()
  });

  const approvalMutation = useMutation({
    mutationFn: (p: { version: number; approval_status: "approved" | "rejected" }) =>
      updateModelVersionApproval(tenantId, projectId, modelId, p.version, token, {
        approval_status: p.approval_status,
        reason: p.approval_status === "rejected" ? "rejected via UI" : null
      }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const servingAssignMutation = useMutation({
    mutationFn: (p: { slot: string; version: number }) =>
      setModelServingSlot(tenantId, projectId, modelId, p.slot, token, { version: p.version }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.serving(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });
  const triggerPolicyMutation = useMutation({
    mutationFn: () =>
      updateModelTriggerPolicy(tenantId, projectId, modelId, token, {
        trigger_mode: triggerMode,
        debounce_minutes: Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10),
        schedule_cron: scheduleCron.trim() || "0 */6 * * *"
      }),
    onSuccess: async (saved) => {
      setPolicyMsg("Saved");
      setTriggerMode(saved.trigger_mode);
      setDebounceMinutes(String(saved.debounce_minutes || 10));
      setScheduleCron(saved.schedule_cron || "0 */6 * * *");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.triggerPolicy(tenantId, projectId, modelId) });
      window.setTimeout(() => setPolicyMsg(""), 1500);
    },
    onError: (e: any) => {
      setPolicyMsg(`Save failed: ${String(e?.message || e)}`);
    }
  });
  const deleteModelMutation = useMutation({
    mutationFn: () => deleteModel(tenantId, projectId, modelId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId) });
      router.push("/models");
    }
  });
  const deleteVersionMutation = useMutation({
    mutationFn: (version: number) => deleteModelVersion(tenantId, projectId, modelId, version, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    }
  });
 
  const openConfirm = (title: string, body: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const effectiveTriggerMode = triggerPolicyQuery.data?.trigger_mode || triggerMode;
  const effectiveDebounce = triggerPolicyQuery.data?.debounce_minutes ?? Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10);
  const effectiveCron = triggerPolicyQuery.data?.schedule_cron || scheduleCron || "0 */6 * * *";

  return (
    <RouteShell
      activeNav="Models"
      title={`Model ${model?.name ?? modelId}`}
      subtitle="Governance, versions, and trigger policy"
    >
      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        body={confirmBody}
        onCancel={() => setConfirmOpen(false)}
        onDelete={() => {
          if (confirmAction) void confirmAction();
        }}
        isLoading={deleteModelMutation.isPending || deleteVersionMutation.isPending}
      />
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="rounded-xl px-3 py-2 text-sm"
            onClick={() => router.push("/models")}
          >
            Back to Models
          </Button>
          <Button
            variant="danger"
            className="rounded-xl px-3 py-2 text-sm"
            onClick={() =>
              openConfirm(
                "Delete model",
                `Delete model "${model?.name || modelId}" and all of its versions?`,
                async () => {
                  await deleteModelMutation.mutateAsync();
                  setConfirmOpen(false);
                }
              )
            }
            disabled={deleteModelMutation.isPending}
          >
            Delete model
          </Button>
        </div>
      </div>

      <Card>
          <CardContent className="pt-4">
          <div className="mb-3 rounded-xl border border-border bg-muted p-3 text-xs">
          <div className="text-foreground">
            Status:{" "}
            <span className={modelStatusQuery.data?.status === "READY" ? "text-emerald-400" : "text-amber-400"}>
              {modelStatusQuery.data?.status || "UNKNOWN"}
            </span>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-muted p-3">
          <h3 className="mb-2 text-xs font-semibold text-foreground">Auto Trigger Config</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "manual"}
                onChange={() => setTriggerMode("manual")}
              />
              Manual
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "auto_ready"}
                onChange={() => setTriggerMode("auto_ready")}
              />
              Auto when READY
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "schedule"}
                onChange={() => setTriggerMode("schedule")}
              />
              Schedule (cron)
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Debounce (minutes)
              <input
                value={debounceMinutes}
                onChange={(e) => setDebounceMinutes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Cron
              <input
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              />
            </label>
          </div>
          <div className="mt-2 text-caption text-muted-foreground">
            Applied mode: <span className="text-foreground">{effectiveTriggerMode}</span> · debounce:{" "}
            <span className="text-foreground">{effectiveDebounce}m</span>
            {effectiveTriggerMode === "schedule" ? (
              <>
                {" · "}cron: <span className="text-foreground">{effectiveCron}</span>
              </>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              className="rounded-lg px-3 py-1 text-xs"
              onClick={() => triggerPolicyMutation.mutate()}
              disabled={triggerPolicyMutation.isPending}
            >
              Save Trigger Policy
            </Button>
            {policyMsg ? <span className="text-xs text-foreground">{policyMsg}</span> : null}
          </div>
        </div>

        {!!(recentRunsQuery.data || []).length && (
          <div className="mb-4 rounded-xl border border-border bg-muted p-3">
            <h3 className="mb-2 text-xs font-semibold text-foreground">Recent Runs</h3>
            <div className="space-y-1 text-xs text-foreground">
              {(recentRunsQuery.data || []).map((r) => (
                <div key={r.run_id} className="flex items-center justify-between rounded border border-border px-2 py-1">
                  <span className="font-mono">{r.run_id}</span>
                  <span>
                    {r.status} | {r.training_mode || "full"} | {formatDateTimeCompact(r.updated_at)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Lineage context: use run detail and model versions for traceability.
            </div>
          </div>
        )}

        {projectId !== "all" && ENABLE_SERVING_SLOTS_UI ? (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-200">Serving slots</h3>
            <p className="mb-2 text-caption text-slate-400">
              Map a registry version to champion / candidate / challenger / canary for routing metadata.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {SERVING_SLOTS.map((slot) => {
                const cur = servingQuery.data?.slots?.[slot];
                return (
                  <div
                    key={slot}
                    className="flex flex-wrap items-center gap-2 rounded border border-slate-700 px-2 py-2 text-xs"
                  >
                    <span className="font-medium capitalize text-slate-200">{slot}</span>
                    <span className="text-slate-400">{cur ? `v${cur.version}` : "—"}</span>
                    <input
                      type="number"
                      min={1}
                      value={servingSlotDraft[slot] ?? ""}
                      onChange={(e) =>
                        setServingSlotDraft((prev) => ({ ...prev, [slot]: e.target.value }))
                      }
                      placeholder="ver"
                      className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-700 px-2 py-1 text-caption text-slate-100 hover:bg-slate-600 disabled:opacity-60"
                      disabled={servingAssignMutation.isPending}
                      onClick={() => {
                        const n = Number.parseInt(String(servingSlotDraft[slot] || "").trim(), 10);
                        if (!Number.isFinite(n) || n < 1) return;
                        servingAssignMutation.mutate({ slot, version: n });
                      }}
                    >
                      Set
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section font-semibold text-foreground">Versions</h2>
          {versionBanner ? (
            <span className="version-inline-banner">{versionBanner}</span>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter stage</span>
            <select
              className="rounded-lg border border-border bg-muted px-2 py-1 text-xs text-foreground"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="all">all</option>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>
        <DataTableShell>
          <DataTable className="w-full table-fixed text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-[110px] px-3 py-2 text-left">Version</th>
                <th className="w-[120px] px-3 py-2 text-left">Stage</th>
                <th className="w-[160px] px-3 py-2 text-left">Approval</th>
                <th className="px-3 py-2 text-left">Run</th>
                <th className="min-w-[420px] px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version_id} className="interactive-row border-t border-border transition-colors">
                  <td className="px-3 py-2">v{v.version}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      v.stage === "production"
                        ? "border-[#3ecf8e]/40 bg-[#3ecf8e]/15 text-[#3ecf8e]"
                        : "border-border bg-muted text-foreground"
                    }`}>
                      {v.stage === "production" ? "●" : "○"} {v.stage}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-block w-fit max-w-full truncate ${modelApprovalPillClass(
                          v.approval_status
                        )}`}
                        title={v.approval_reason || undefined}
                      >
                        {v.approval_status || "—"}
                      </span>
                      {projectId !== "all" && v.approval_status === "pending_manual_approval" ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="approval-action-btn approval-action-btn--approve"
                            disabled={approvalMutation.isPending}
                            onClick={() =>
                              approvalMutation.mutate({ version: v.version, approval_status: "approved" })
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="approval-action-btn approval-action-btn--reject"
                            disabled={approvalMutation.isPending}
                            onClick={() =>
                              approvalMutation.mutate({ version: v.version, approval_status: "rejected" })
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block w-full truncate font-mono text-xs">{v.run_id || "-"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "production" })}
                        className="action-btn-sm btn-action-promote rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={promoteMutation.isPending || v.stage === "production"}
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => promoteMutation.mutate({ version: v.version, stage: "staging" })}
                        className="action-btn-md btn-action-rollback rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={promoteMutation.isPending || v.stage === "staging"}
                      >
                        Rollback to staging
                      </button>
                      <button
                        onClick={() =>
                          openConfirm(
                            "Delete version",
                            `Delete version v${v.version} of model "${model?.name || modelId}"?`,
                            async () => {
                              await deleteVersionMutation.mutateAsync(v.version);
                              setConfirmOpen(false);
                            }
                          )
                        }
                        className="action-btn-xs btn-action-delete rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                        disabled={deleteVersionMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versions.length && (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={5}>
                    No versions for current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </DataTableShell>
      </CardContent>
      </Card>
    </RouteShell>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  onDelete,
  onCancel,
  isLoading
}: {
  open: boolean;
  title: string;
  body: string;
  onDelete: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-section font-semibold text-slate-200">{title}</h3>
        <p className="mb-4 text-sm text-slate-400">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-action-cancel rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="btn-action-delete rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
