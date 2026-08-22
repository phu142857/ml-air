"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save, Settings2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { StatusBadge } from "@/components/mlops/status-badge";
import {
  fetchModelEffectiveConfiguration,
  putConfigurationOverride,
  resetConfigurationOverride,
  type EffectiveConfigurationItem,
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function provenanceLabel(row: EffectiveConfigurationItem): string {
  if (row.source.source_kind === "default" || row.source.source_kind === "l4") {
    return "default";
  }
  if (row.inherited) {
    return "inherited";
  }
  if (row.source.source_kind === "legacy") {
    return "policy-derived";
  }
  return "overridden";
}

function provenanceBadge(row: EffectiveConfigurationItem) {
  const label = provenanceLabel(row);
  if (label === "overridden") {
    return <StatusBadge status="success" label={label} size="sm" />;
  }
  if (label === "inherited") {
    return <StatusBadge status="pending" label={label} size="sm" />;
  }
  return <StatusBadge status="pending" label={label} size="sm" />;
}

type Props = { modelId: string };

export function EffectiveConfigPanel({ modelId }: Props) {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = useRealtimeQueryPolling();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: mlairKeys.models.effectiveConfiguration(tenantId, projectId, modelId),
    queryFn: () => fetchModelEffectiveConfiguration(tenantId, projectId, modelId, token),
    enabled: Boolean(modelId && token?.trim()),
    ...poll,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) =>
      putConfigurationOverride(tenantId, projectId, token, key, {
        scope_level: "resource",
        resource_type: "model",
        resource_id: modelId,
        value,
        enabled: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.effectiveConfiguration(tenantId, projectId, modelId),
      });
      toastSuccess("Configuration override saved");
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const resetMutation = useMutation({
    mutationFn: async (key: string) =>
      resetConfigurationOverride(tenantId, projectId, token, key, {
        scope_level: "resource",
        resource_type: "model",
        resource_id: modelId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.models.effectiveConfiguration(tenantId, projectId, modelId),
      });
      toastSuccess("Override reset — inheriting parent scope");
    },
    onError: (err) => toastError(formatApiClientError(err)),
  });

  const items = query.data?.items ?? [];

  const columns: DataTableColumn<EffectiveConfigurationItem>[] = [
    {
      id: "key",
      header: "Key",
      width: 240,
      cell: (row) => <span className="font-mono text-xs">{row.key}</span>,
    },
    {
      id: "value",
      header: "Effective value",
      width: 180,
      cell: (row) => {
        if (row.value_type === "boolean") {
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                saveMutation.mutate({ key: row.key, value: !row.value })
              }
            >
              {row.value ? "true" : "false"}
            </Button>
          );
        }
        if (row.value_type === "number") {
          const draft = drafts[row.key] ?? String(row.value ?? "");
          return (
            <Input
              className="h-7 font-mono text-xs"
              value={draft}
              onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
            />
          );
        }
        return (
          <span className="font-mono text-sm tabular-nums">
            {typeof row.value === "boolean" ? (row.value ? "true" : "false") : String(row.value ?? "—")}
          </span>
        );
      },
    },
    {
      id: "provenance",
      header: "Provenance",
      width: 110,
      cell: (row) => provenanceBadge(row),
    },
    {
      id: "source",
      header: "Source",
      width: 120,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.source.scope_level}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: 120,
      cell: (row) => (
        <div className="flex gap-1">
          {row.value_type === "number" ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Save override"
              onClick={() => {
                const raw = drafts[row.key] ?? String(row.value ?? "");
                const num = Number(raw);
                if (Number.isNaN(num)) {
                  toastError("Invalid number");
                  return;
                }
                saveMutation.mutate({ key: row.key, value: num });
              }}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {provenanceLabel(row) === "overridden" ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Reset to inherit"
              onClick={() => resetMutation.mutate(row.key)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading effective configuration…
      </div>
    );
  }

  if (query.isError) {
    return (
      <MlopsEmptyState
        icon={Settings2}
        title="Could not load configuration"
        description="Effective configuration is unavailable for this model."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Effective values with provenance (default / inherited / overridden). Resource-scope edits write to{" "}
        <code className="text-[10px]">cp_configuration_entries</code>. Resolved at{" "}
        {query.data?.resolved_at ? formatDateTimeCompact(query.data.resolved_at) : "—"}.
      </p>
      {!items.length ? (
        <MlopsEmptyState icon={Settings2} title="No configuration keys" />
      ) : (
        <MlopsDataTable<EffectiveConfigurationItem>
          columns={columns}
          data={items}
          keyExtractor={(row) => row.key}
        />
      )}
    </div>
  );
}
