"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchPlugins, reloadPlugins, togglePlugin, validatePlugin } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { token } = useAppContext();
  const [selectedPlugin, setSelectedPlugin] = useState("");
  const [validatePayload, setValidatePayload] = useState('{"name":"mlair"}');
  const [validateResult, setValidateResult] = useState("");

  const pluginsQuery = useQuery({
    queryKey: mlairKeys.plugins.all(),
    queryFn: () => fetchPlugins(token)
  });

  const items = pluginsQuery.data?.items ?? [];
  const errors = pluginsQuery.data?.errors ?? [];

  const selected = useMemo(() => items.find((x) => x.name === selectedPlugin) ?? null, [items, selectedPlugin]);

  const reloadMutation = useMutation({
    mutationFn: () => reloadPlugins(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all() });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => togglePlugin(name, enabled, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all() });
    }
  });

  const validateMutation = useMutation({
    mutationFn: async ({ name, context }: { name: string; context: Record<string, unknown> }) =>
      validatePlugin(name, context, token),
    onSuccess: (data) => {
      setValidateResult(JSON.stringify(data, null, 2));
    },
    onError: (err) => {
      setValidateResult(String(err));
    }
  });

  const onValidate = () => {
    if (!selected) return;
    try {
      const context = JSON.parse(validatePayload) as Record<string, unknown>;
      validateMutation.mutate({ name: selected.name, context });
    } catch {
      setValidateResult("invalid_json_payload");
    }
  };

  return (
    <RouteShell activeNav="Settings" title="Settings" subtitle="Environment and configuration panel">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-section font-semibold text-foreground">Plugin Registry</h2>
            <Button
              className="rounded-xl px-3 py-2 text-xs"
              onClick={() => reloadMutation.mutate()}
              disabled={reloadMutation.isPending}
            >
              Reload Plugins
            </Button>
          </div>
          <DataTableShell>
            <DataTable className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Enabled</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((plugin) => (
                  <tr
                    key={plugin.name}
                    className={`interactive-row cursor-pointer border-t border-border ${selectedPlugin === plugin.name ? "bg-blue-900/20" : ""}`}
                    onClick={() => setSelectedPlugin(plugin.name)}
                  >
                    <td className="px-3 py-2">{plugin.name}</td>
                    <td className="px-3 py-2">{plugin.version}</td>
                    <td className="px-3 py-2">{plugin.enabled ? "on" : "off"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          className="action-btn-xs rounded-lg px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMutation.mutate({ name: plugin.name, enabled: true });
                          }}
                          disabled={toggleMutation.isPending || plugin.enabled}
                        >
                          Enable
                        </Button>
                        <Button
                          variant="danger"
                          className="action-btn-xs rounded-lg px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMutation.mutate({ name: plugin.name, enabled: false });
                          }}
                          disabled={toggleMutation.isPending || !plugin.enabled}
                        >
                          Disable
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                      {pluginsQuery.isLoading ? "Loading plugins..." : "No plugins discovered"}
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </DataTableShell>
          {!!errors.length && (
            <div className="mt-3 rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
              <div className="mb-1 font-semibold">Loader warnings</div>
              {errors.map((error) => (
                <div key={`${error.entry_point}:${error.error}`}>
                  {error.entry_point}: {error.error}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plugin Detail</CardTitle>
          </CardHeader>
          <CardContent>
          {selected ? (
            <div className="space-y-3 text-sm text-foreground">
              <div className="rounded-xl border border-border bg-muted p-3">
                <div className="text-xs text-muted-foreground">Metadata</div>
                <div className="mt-1">
                  {selected.name} v{selected.version} (engine {selected.engine_version})
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">UI Schema</div>
                <pre className="overflow-auto font-mono text-xs text-foreground">
                  {JSON.stringify(selected.ui_schema ?? { note: "plugin does not expose ui_schema" }, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">Validate Context</div>
                <textarea
                  className="h-28 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground"
                  value={validatePayload}
                  onChange={(e) => setValidatePayload(e.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    className="rounded-lg px-3 py-1.5 text-xs"
                    onClick={onValidate}
                    disabled={validateMutation.isPending}
                  >
                    Validate
                  </Button>
                </div>
                {validateResult && (
                  <pre className="mt-2 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-xs text-foreground">
                    {validateResult}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
              Select a plugin from the registry table.
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </RouteShell>
  );
}
