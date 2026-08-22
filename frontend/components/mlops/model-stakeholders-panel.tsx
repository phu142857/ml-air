"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { fetchModelStakeholders, replaceModelStakeholders } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { formatApiClientError } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "reviewer", label: "Reviewer" },
  { value: "executor", label: "Executor" },
  { value: "approver", label: "Approver" },
] as const;

type DraftRow = { user_id: string; role: string };

type Props = { modelId: string };

export function ModelStakeholdersPanel({ modelId }: Props) {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = useRealtimeQueryPolling();
  const [draft, setDraft] = useState<DraftRow>({ user_id: "", role: "reviewer" });

  const stakeholdersQuery = useQuery({
    queryKey: mlairKeys.models.stakeholders(tenantId, projectId, modelId),
    queryFn: () => fetchModelStakeholders(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const [rows, setRows] = useState<DraftRow[]>([]);

  useEffect(() => {
    const items = stakeholdersQuery.data?.items ?? [];
    setRows(items.map((s) => ({ user_id: s.user_id, role: s.role })));
  }, [stakeholdersQuery.data?.items]);

  const saveMutation = useMutation({
    mutationFn: () => replaceModelStakeholders(tenantId, projectId, modelId, token, rows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.stakeholders(tenantId, projectId, modelId),
      });
      toastSuccess("Stakeholders updated");
    },
    onError: (e) => toastError("Save failed", formatApiClientError(e)),
  });

  const addRow = () => {
    const uid = draft.user_id.trim();
    if (!uid) return;
    setRows((prev) => [...prev.filter((r) => !(r.user_id === uid && r.role === draft.role)), { user_id: uid, role: draft.role }]);
    setDraft({ user_id: "", role: draft.role });
  };

  if (stakeholdersQuery.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign owner, reviewer, executor, and approver. When reviewer/approver exist, approval uses a two-step workflow.
        Executors cannot final-approve (separation of duties).
      </p>

      {rows.length === 0 ? (
        <MlopsEmptyState icon={Users} title="No stakeholders" description="Add users below to enable process-aware governance." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={`${r.user_id}-${r.role}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-mono text-xs">{r.user_id}</span>
              <span className="text-muted-foreground">{r.role}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setRows((prev) => prev.filter((x) => !(x.user_id === r.user_id && x.role === r.role)))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="stakeholder-user">User ID</Label>
          <Input
            id="stakeholder-user"
            value={draft.user_id}
            onChange={(e) => setDraft((d) => ({ ...d, user_id: e.target.value }))}
            placeholder="user uuid from Identity"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <SelectDropdown
            value={draft.role}
            onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
            options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus className="mr-2 size-4" />
          Add
        </Button>
        <Button type="button" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save stakeholders
        </Button>
      </div>
    </div>
  );
}
