"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Puzzle, RefreshCw } from "lucide-react";
import { useAppContext } from "@/lib/app-context";
import { fetchPlugins, reloadPlugins, togglePlugin, validatePlugin } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge"
import { STATUS_CHIP_CLASS } from "@/lib/status-style";
import { MlopsEmptyState, DetailSection } from "@/components/mlops/layout";
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import type { PluginItem } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast-actions";
import { SelectDropdown } from "@/components/ui/select-dropdown";

export function PluginsSettingsTab() {
  const queryClient = useQueryClient();
  const { token } = useAppContext();
  const [selectedPlugin, setSelectedPlugin] = useState("");
  const [validatePayload, setValidatePayload] = useState('{"name":"mlair"}');
  const [validateResult, setValidateResult] = useState("");

  const pluginsQuery = useQuery({
    queryKey: [...mlairKeys.plugins.all(), token],
    queryFn: () => fetchPlugins(token)
  });

  const items = pluginsQuery.data?.items ?? [];
  const loadErrors = pluginsQuery.data?.errors ?? [];

  const selected = useMemo(() => items.find((x) => x.name === selectedPlugin) ?? null, [items, selectedPlugin]);

  const reloadMutation = useMutation({
    mutationFn: () => reloadPlugins(token),
    onSuccess: async () => {
      toastSuccess("Plugins reloaded");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all(), exact: false });
    },
    onError: (e) => toastError("Reload failed", String((e as Error)?.message || e)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => togglePlugin(name, enabled, token),
    onSuccess: async (_data, { name, enabled }) => {
      toastSuccess(enabled ? "Plugin enabled" : "Plugin disabled", name);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all(), exact: false });
    },
    onError: (e) => toastError("Toggle failed", String((e as Error)?.message || e)),
  });

  const pluginOptions = useMemo(
    () => items.map((p) => ({ value: p.name, label: p.name })),
    [items]
  );

  useEffect(() => {
    if (items.length === 0) return;
    if (!selectedPlugin || !items.some((i) => i.name === selectedPlugin)) {
      setSelectedPlugin(items[0].name);
    }
  }, [items, selectedPlugin]);

  const pluginColumns: DataTableColumn<PluginItem>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (p) => <span className="font-mono text-xs text-foreground">{p.name}</span>,
      },
      {
        id: "version",
        header: "Version",
        cell: (p) => <span className="text-xs text-muted-foreground">{p.version}</span>,
      },
      {
        id: "engine",
        header: "Engine",
        cell: (p) => <span className="text-xs text-muted-foreground">{p.engine_version}</span>,
      },
      {
        id: "compat",
        header: "Compat",
        cell: (p) =>
          p.compatibility?.compatible === false ? (
            <Badge variant="outline" className={`text-[10px] ${STATUS_CHIP_CLASS.failed}`}>
              blocked
            </Badge>
          ) : (
            <Badge variant="outline" className="border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)] text-[10px]">
              ok
            </Badge>
          ),
      },
      {
        id: "enabled",
        header: "Enabled",
        cell: (p) =>
          p.enabled ? (
            <Badge variant="outline" className="border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)]">
              on
            </Badge>
          ) : (
            <Badge variant="outline" className="border-border text-muted-foreground">
              off
            </Badge>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        className: "text-right",
        cell: (p) => (
          <div className="text-right">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 border-border bg-card text-xs"
              disabled={toggleMutation.isPending}
              onClick={() => toggleMutation.mutate({ name: p.name, enabled: !p.enabled })}
            >
              {p.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        ),
      },
    ],
    [toggleMutation],
  );

  return (
    <div className="max-w-4xl space-y-6">
      <DetailSection
        title="Loaded plugins"
        description="Plugins registered by the API runtime."
        accentBorder="emerald"
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 bg-card border-border"
            disabled={reloadMutation.isPending}
            onClick={() => reloadMutation.mutate()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reloadMutation.isPending ? "animate-spin" : ""}`} />
            Reload registry
          </Button>
        }
        bodyClassName="space-y-4"
      >
        {pluginsQuery.isFetching ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span>Refreshing…</span>
          </div>
        ) : null}

        {pluginsQuery.isError ? (
          <p className="rounded-lg border border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] px-3 py-2 text-xs text-red-300">
            {(pluginsQuery.error as Error)?.message || "Failed to load plugins"}
          </p>
        ) : null}

        {loadErrors.length > 0 ? (
          <div className="rounded-lg border border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] p-3 text-xs text-[color:var(--status-pending-fg)]">
            <p className="mb-2 font-medium text-[color:var(--status-pending-fg)]">Load-time errors</p>
            <ul className="list-inside list-disc space-y-1 text-[color:var(--status-pending-fg)]/90">
              {loadErrors.map((e) => (
                <li key={e.entry_point}>
                  <span className="font-mono">{e.entry_point}</span>: {e.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {pluginsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading plugins…</p>
        ) : items.length === 0 ? (
          <MlopsEmptyState
            icon={Puzzle}
            title="No plugins loaded"
            description="The API returned an empty registry. Use Reload registry after adding plugins on the server."
          />
        ) : (
          <DataTable
            columns={pluginColumns}
            data={items}
            keyExtractor={(p) => p.name}
            emptyMessage="No plugins returned from the API."
          />
        )}
      </DetailSection>

      <DetailSection
        title="Validate plugin"
        description="POST validation context JSON to a plugin entrypoint."
        accentBorder="sky"
        bodyClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Plugin</Label>
            {pluginOptions.length ? (
              <SelectDropdown
                value={selectedPlugin}
                onChange={setSelectedPlugin}
                options={pluginOptions}
                placeholder="Select plugin"
                aria-label="Plugin to validate"
              />
            ) : (
              <p className="inset-surface px-3 py-2 text-xs text-muted-foreground">
                No plugins loaded yet.
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-muted-foreground">Context JSON</Label>
            <Textarea
              value={validatePayload}
              onChange={(e) => setValidatePayload(e.target.value)}
              rows={5}
              className="font-mono text-xs bg-muted/30 border-border"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={!pluginOptions.length || !selectedPlugin}
            onClick={async () => {
              setValidateResult("");
              try {
                const ctx = JSON.parse(validatePayload || "{}") as Record<string, unknown>;
                const r = await validatePlugin(selectedPlugin, ctx, token);
                setValidateResult(JSON.stringify(r, null, 2));
              } catch (e) {
                setValidateResult((e as Error).message || String(e));
              }
            }}
          >
            Run validate
          </Button>
        </div>
        {validateResult ? (
          <pre className="max-h-48 overflow-auto inset-surface p-3 font-mono text-xs text-[color:var(--status-success-fg)] whitespace-pre-wrap">
            {validateResult}
          </pre>
        ) : null}
        {selected ? (
          <p className="text-[10px] text-muted-foreground/80">
            Selected: <span className="font-mono text-muted-foreground">{selected.name}</span> · inputs keys:{" "}
            {Object.keys(selected.inputs || {}).length}
          </p>
        ) : null}
      </DetailSection>
    </div>
  );
}
