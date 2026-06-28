"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import {
  createDatasetTrainingPolicy,
  fetchModels,
  upsertDatasetTrainingPolicy,
  type DatasetTrainingPolicy,
} from "@/lib/api";

const POLICY_TRIGGER_MODE_OPTIONS = [
  { value: "manual", label: "manual" },
  { value: "auto_ready", label: "auto_ready" },
  { value: "schedule", label: "schedule" },
];

const POLICY_PRESETS = [
  { id: "small", label: "Small incremental", requiredSize: 100, freshnessHours: 168 },
  { id: "daily", label: "Daily retrain", requiredSize: 1000, freshnessHours: 24 },
  { id: "production", label: "Production gate", requiredSize: 5000, freshnessHours: 24 },
] as const;

function formatValidationRulesDraft(rules: DatasetTrainingPolicy["validation_rules"]): string {
  if (!rules?.length) return "[]";
  try {
    return JSON.stringify(rules, null, 2);
  } catch {
    return "[]";
  }
}

function parseValidationRulesDraft(draft: string): Array<Record<string, unknown> | string> {
  const trimmed = draft.trim();
  if (!trimmed || trimmed === "[]") return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("validation_rules must be a JSON array");
  }
  return parsed as Array<Record<string, unknown> | string>;
}

export function policySelectLabel(policy: DatasetTrainingPolicy): string {
  const rules = policy.validation_rules?.length ?? 0;
  const model = policy.model_id ? ` · model=${String(policy.model_id).slice(0, 8)}…` : "";
  return `${policy.trigger_mode} · rows≥${policy.required_size} · fresh≤${policy.freshness_hours}h · rules=${rules}${model}`;
}

type DatasetTrainingPolicyPanelProps = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  token: string;
  scopePinned: boolean;
  policies: DatasetTrainingPolicy[];
  selectedPolicyId: string;
  onSelectedPolicyIdChange: (policyId: string) => void;
  onPolicyMutated?: () => void | Promise<void>;
};

export function DatasetTrainingPolicyPanel({
  tenantId,
  projectId,
  datasetId,
  token,
  scopePinned,
  policies,
  selectedPolicyId,
  onSelectedPolicyIdChange,
  onPolicyMutated,
}: DatasetTrainingPolicyPanelProps) {
  const [requiredSizeDraft, setRequiredSizeDraft] = useState("1000");
  const [freshnessHoursDraft, setFreshnessHoursDraft] = useState("24");
  const [triggerModeDraft, setTriggerModeDraft] = useState("manual");
  const [modelIdDraft, setModelIdDraft] = useState("");
  const [validationRulesDraft, setValidationRulesDraft] = useState("[]");
  const [policyMsg, setPolicyMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedPolicy = useMemo(
    () => policies.find((p) => p.policy_id === selectedPolicyId) ?? null,
    [policies, selectedPolicyId],
  );

  const syncDraftsFromPolicy = useCallback((policy: DatasetTrainingPolicy) => {
    setRequiredSizeDraft(String(policy.required_size ?? 1000));
    setFreshnessHoursDraft(String(policy.freshness_hours ?? 24));
    setTriggerModeDraft(String(policy.trigger_mode || "manual"));
    setModelIdDraft(policy.model_id ? String(policy.model_id) : "");
    setValidationRulesDraft(formatValidationRulesDraft(policy.validation_rules));
  }, []);

  useEffect(() => {
    if (selectedPolicy) syncDraftsFromPolicy(selectedPolicy);
  }, [selectedPolicy, syncDraftsFromPolicy]);

  const modelsQuery = useQuery({
    queryKey: ["dataset-hub-policy-models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: Boolean(token && scopePinned),
    staleTime: 60_000,
  });

  const modelOptions = useMemo(() => {
    const items = modelsQuery.data?.items ?? [];
    return [
      { value: "", label: "Any model (no compatibility gate)" },
      ...items.map((m) => ({
        value: m.model_id,
        label: m.name ? `${m.name} (${m.model_id.slice(0, 8)}…)` : m.model_id,
      })),
    ];
  }, [modelsQuery.data?.items]);

  const policySelectOptions = useMemo(
    () =>
      policies.map((p) => ({
        value: p.policy_id,
        label: policySelectLabel(p),
      })),
    [policies],
  );

  const buildPayload = () => {
    const required_size = Math.max(1, Number.parseInt(requiredSizeDraft, 10) || 1);
    const freshness_hours = Math.max(1, Number.parseInt(freshnessHoursDraft, 10) || 24);
    const trigger_mode = triggerModeDraft.trim() || "manual";
    const model_id = modelIdDraft.trim() || undefined;
    const validation_rules = parseValidationRulesDraft(validationRulesDraft);
    return { required_size, freshness_hours, trigger_mode, model_id, validation_rules };
  };

  const savePolicy = async () => {
    if (!selectedPolicy) return;
    setSaving(true);
    setPolicyMsg("");
    try {
      const payload = buildPayload();
      await upsertDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        policy_id: selectedPolicy.policy_id,
        ...payload,
      });
      await onPolicyMutated?.();
      setPolicyMsg("Policy saved and readiness re-evaluated.");
    } catch (err) {
      setPolicyMsg(`Policy update failed: ${String((err as Error)?.message || err)}`);
    } finally {
      setSaving(false);
    }
  };

  const createPolicy = async () => {
    setSaving(true);
    setPolicyMsg("");
    try {
      const payload = buildPayload();
      const created = await createDatasetTrainingPolicy(tenantId, projectId, datasetId, token, payload);
      onSelectedPolicyIdChange(created.policy_id);
      syncDraftsFromPolicy(created);
      await onPolicyMutated?.();
      setPolicyMsg("Policy created and selected.");
    } catch (err) {
      setPolicyMsg(`Create policy failed: ${String((err as Error)?.message || err)}`);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async (preset: (typeof POLICY_PRESETS)[number]) => {
    setRequiredSizeDraft(String(preset.requiredSize));
    setFreshnessHoursDraft(String(preset.freshnessHours));
    if (!selectedPolicy) return;
    setSaving(true);
    setPolicyMsg("");
    try {
      await upsertDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        policy_id: selectedPolicy.policy_id,
        required_size: preset.requiredSize,
        freshness_hours: preset.freshnessHours,
        trigger_mode: triggerModeDraft,
        model_id: modelIdDraft.trim() || undefined,
        validation_rules: parseValidationRulesDraft(validationRulesDraft),
      });
      await onPolicyMutated?.();
      setPolicyMsg(`Applied preset “${preset.label}”.`);
    } catch (err) {
      setPolicyMsg(`Preset failed: ${String((err as Error)?.message || err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="mb-3 inset-surface px-3 py-2" open>
      <summary className="cursor-pointer select-none text-xs font-medium text-foreground hover:text-foreground/90">
        Training policy configuration
      </summary>
      <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
        <label className="block text-xs text-muted-foreground">
          Active policy
          <SelectDropdown
            value={selectedPolicyId}
            onChange={(id) => {
              onSelectedPolicyIdChange(id);
              const picked = policies.find((p) => p.policy_id === id);
              if (picked) syncDraftsFromPolicy(picked);
            }}
            options={policySelectOptions}
            className="mt-1"
            buttonClassName="panel-surface bg-muted/20 px-3 py-2 text-sm"
            disabled={policySelectOptions.length === 0}
            aria-label="Training policy for readiness"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            <Label className="text-[11px] font-normal text-muted-foreground">Required rows (min)</Label>
            <input
              type="number"
              min={1}
              value={requiredSizeDraft}
              onChange={(e) => setRequiredSizeDraft(e.target.value)}
              className="mt-1 w-full appearance-none panel-surface bg-muted/20 px-2 py-2 text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            <Label className="text-[11px] font-normal text-muted-foreground">Freshness window (hours)</Label>
            <input
              type="number"
              min={1}
              value={freshnessHoursDraft}
              onChange={(e) => setFreshnessHoursDraft(e.target.value)}
              className="mt-1 w-full appearance-none panel-surface bg-muted/20 px-2 py-2 text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            <Label className="text-[11px] font-normal text-muted-foreground">Trigger mode</Label>
            <SelectDropdown
              value={triggerModeDraft}
              onChange={setTriggerModeDraft}
              options={POLICY_TRIGGER_MODE_OPTIONS}
              className="mt-1"
              buttonClassName="panel-surface bg-muted/20 px-2 py-2 text-xs"
              aria-label="Policy trigger mode"
            />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            <Label className="text-[11px] font-normal text-muted-foreground">Model compatibility (optional)</Label>
            <SelectDropdown
              value={modelIdDraft}
              onChange={setModelIdDraft}
              options={modelOptions}
              className="mt-1"
              buttonClassName="panel-surface bg-muted/20 px-2 py-2 text-xs"
              disabled={!scopePinned || modelsQuery.isLoading}
              aria-label="Model for policy compatibility"
            />
          </label>
        </div>

        <label className="block text-xs text-muted-foreground">
          <Label className="text-[11px] font-normal text-muted-foreground">Validation rules (JSON array)</Label>
          <textarea
            value={validationRulesDraft}
            onChange={(e) => setValidationRulesDraft(e.target.value)}
            rows={3}
            spellCheck={false}
            className="mt-1 w-full resize-y panel-surface bg-muted/20 px-2 py-2 font-mono text-[11px] text-foreground"
            placeholder='[]'
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1 text-xs"
            disabled={!selectedPolicyId || saving}
            onClick={() => void savePolicy()}
          >
            Save policy
          </Button>
          <Button type="button" variant="secondary" className="px-3 py-1 text-xs" disabled={saving} onClick={() => void createPolicy()}>
            Create policy
          </Button>
          {policyMsg ? <span className="text-xs text-muted-foreground">{policyMsg}</span> : null}
        </div>

        <div>
          <p className="mb-2 text-[11px] text-muted-foreground">Quick presets (rows + freshness)</p>
          <div className="flex flex-wrap gap-2">
            {POLICY_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={!selectedPolicyId || saving}
                onClick={() => void applyPreset(preset)}
              >
                {preset.label} ({preset.requiredSize} rows · {preset.freshnessHours}h)
              </Button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

type PolicyConfigSummaryProps = {
  policy: DatasetTrainingPolicy | null | undefined;
  versionCreatedAt?: string | null;
};

export function PolicyConfigSummary({ policy, versionCreatedAt }: PolicyConfigSummaryProps) {
  const versionAgeHours = useMemo(() => {
    if (!versionCreatedAt) return null;
    const ts = Date.parse(versionCreatedAt);
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, (Date.now() - ts) / 3_600_000);
  }, [versionCreatedAt]);

  if (!policy) return null;

  const rulesCount = policy.validation_rules?.length ?? 0;

  return (
    <div className="mb-3 grid gap-x-4 gap-y-1.5 border-b border-border/60 pb-3 text-xs text-muted-foreground sm:grid-cols-2">
      <div>
        Required rows: <span className="tabular-nums font-medium text-foreground">{policy.required_size}</span>
      </div>
      <div>
        Freshness window:{" "}
        <span className="tabular-nums font-medium text-foreground">{policy.freshness_hours}h</span>
        {versionAgeHours != null ? (
          <span className="text-muted-foreground/90">
            {" "}
            · version age ~{versionAgeHours < 1 ? "<1" : Math.round(versionAgeHours)}h
          </span>
        ) : null}
      </div>
      <div>
        Trigger mode: <span className="font-mono text-foreground">{policy.trigger_mode}</span>
      </div>
      <div>
        Model gate:{" "}
        <span className="font-mono text-foreground">{policy.model_id ? String(policy.model_id) : "any"}</span>
      </div>
      <div className="sm:col-span-2">
        Validation rules: <span className="font-medium text-foreground">{rulesCount}</span>
        {rulesCount > 0 ? (
          <span className="ml-1 font-mono text-[10px] text-muted-foreground/90">
            {JSON.stringify(policy.validation_rules).slice(0, 120)}
            {(policy.validation_rules?.length ?? 0) > 0 && JSON.stringify(policy.validation_rules).length > 120 ? "…" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
