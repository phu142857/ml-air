"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Plus, Shield, Trash2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { StatusBadge } from "@/components/mlops/status-badge";
import {
  deletePolicyRule,
  evaluatePolicy,
  fetchPolicyRules,
  upsertPolicyRule,
  type PolicyRuleItem,
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { formatApiClientError } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

const RULE_KINDS = [
  { value: "drift_threshold", label: "Drift threshold" },
  { value: "slo_breach", label: "SLO breach" },
  { value: "retrain_on_breach", label: "Retrain on breach" },
  { value: "rollback_on_breach", label: "Rollback on breach" },
] as const;

type Props = { modelId: string };

export function ModelPolicyRulesPanel({ modelId }: Props) {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = useRealtimeQueryPolling();
  const [newKind, setNewKind] = useState<string>(RULE_KINDS[0].value);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: mlairKeys.models.policyRules(tenantId, projectId, modelId),
    queryFn: () => fetchPolicyRules(tenantId, projectId, token, { resourceType: "model" }),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const modelRules = useMemo(
    () =>
      (rulesQuery.data?.items ?? []).filter(
        (r) => !r.resource_id || r.resource_id === modelId,
      ),
    [rulesQuery.data?.items, modelId],
  );

  const toggleMutation = useMutation({
    mutationFn: (rule: PolicyRuleItem) =>
      upsertPolicyRule(tenantId, projectId, token, rule.rule_id, {
        resource_type: rule.resource_type,
        resource_id: modelId,
        rule_kind: rule.rule_kind,
        config: rule.config,
        enabled: !rule.enabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.policyRules(tenantId, projectId, modelId),
      });
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const addMutation = useMutation({
    mutationFn: () => {
      const ruleId = `policy-${modelId.slice(0, 8)}-${newKind}`;
      return upsertPolicyRule(tenantId, projectId, token, ruleId, {
        resource_type: "model",
        resource_id: modelId,
        rule_kind: newKind,
        config: { resource_id: modelId },
        enabled: true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.policyRules(tenantId, projectId, modelId),
      });
      toastSuccess("Policy rule saved");
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deletePolicyRule(tenantId, projectId, token, ruleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.policyRules(tenantId, projectId, modelId),
      });
      toastSuccess("Policy rule deleted");
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const evaluateMutation = useMutation({
    mutationFn: () =>
      evaluatePolicy(tenantId, projectId, token, {
        resource_type: "model",
        resource_id: modelId,
        telemetry: { drift: { psi: 0.35 }, slo_breaches: [] },
      }),
    onSuccess: (data) => {
      const summary = data.actions.map((a) => a.action_type).join(", ") || "no actions";
      setEvalResult(`${summary} (evaluated ${data.evaluated_rules} rules)`);
      toastSuccess("Policy evaluated");
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const columns: DataTableColumn<PolicyRuleItem>[] = [
    {
      id: "kind",
      header: "Rule kind",
      width: 160,
      cell: (r) => <span className="font-mono text-xs">{r.rule_kind}</span>,
    },
    {
      id: "enabled",
      header: "Enabled",
      width: 90,
      cell: (r) => (
        <Switch
          checked={r.enabled}
          onCheckedChange={() => toggleMutation.mutate(r)}
          aria-label={`Toggle ${r.rule_kind}`}
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 100,
      cell: (r) =>
        r.enabled ? (
          <StatusBadge status="success" label="active" size="sm" />
        ) : (
          <StatusBadge status="pending" label="off" size="sm" />
        ),
    },
    {
      id: "actions",
      header: "",
      width: 60,
      cell: (r) => (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => deleteMutation.mutate(r.rule_id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  if (rulesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading policy rules…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Control-plane policy rules for this model. Evaluation uses resolved configuration + telemetry.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] space-y-1">
          <Label className="text-xs">Rule kind</Label>
          <SelectDropdown
            value={newKind}
            onChange={setNewKind}
            options={RULE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            aria-label="Rule kind"
          />
        </div>
        <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add rule
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending}
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          Evaluate (dry-run)
        </Button>
      </div>
      {evalResult ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">{evalResult}</p>
      ) : null}
      {!modelRules.length ? (
        <MlopsEmptyState icon={Shield} title="No policy rules" description="Add a rule to enable automated policy evaluation." />
      ) : (
        <MlopsDataTable<PolicyRuleItem> columns={columns} data={modelRules} keyExtractor={(r) => r.rule_id} />
      )}
    </div>
  );
}
