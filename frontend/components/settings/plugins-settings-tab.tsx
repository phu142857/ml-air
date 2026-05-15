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
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
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
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all(), exact: false });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => togglePlugin(name, enabled, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.plugins.all(), exact: false });
    }
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-medium text-zinc-200">Loaded plugins</h3>
          {pluginsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 bg-zinc-900 border-zinc-800"
          disabled={reloadMutation.isPending}
          onClick={() => reloadMutation.mutate()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reloadMutation.isPending ? "animate-spin" : ""}`} />
          Reload registry
        </Button>
      </div>

      {pluginsQuery.isError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {(pluginsQuery.error as Error)?.message || "Failed to load plugins"}
        </p>
      ) : null}

      {loadErrors.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="mb-2 font-medium text-amber-100">Load-time errors</p>
          <ul className="list-inside list-disc space-y-1 text-amber-200/90">
            {loadErrors.map((e) => (
              <li key={e.entry_point}>
                <span className="font-mono">{e.entry_point}</span>: {e.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DataTableShell>
        <DataTable>
          <thead className="border-b border-zinc-800 bg-zinc-900/80">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Version</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Engine</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Enabled</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !pluginsQuery.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No plugins returned from the API.
                </td>
              </tr>
            ) : null}
            {items.map((p) => (
              <tr key={p.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                <td className="px-3 py-2 font-mono text-xs text-zinc-200">{p.name}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">{p.version}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{p.engine_version}</td>
                <td className="px-3 py-2">
                  {p.enabled ? (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                      on
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-600 text-zinc-500">
                      off
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-zinc-700 bg-zinc-900 text-xs"
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ name: p.name, enabled: !p.enabled })}
                  >
                    {p.enabled ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </DataTableShell>

      <div className="rounded-lg border border-zinc-800 p-6 space-y-4">
        <div>
          <h4 className="text-sm font-medium text-zinc-200">Validate plugin</h4>
          <p className="text-xs text-zinc-500">POST validation context JSON to a plugin entrypoint.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Plugin</Label>
            {pluginOptions.length ? (
              <SelectDropdown
                value={selectedPlugin}
                onChange={setSelectedPlugin}
                options={pluginOptions}
                placeholder="Select plugin"
                aria-label="Plugin to validate"
              />
            ) : (
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                No plugins loaded yet.
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-zinc-400">Context JSON</Label>
            <Textarea
              value={validatePayload}
              onChange={(e) => setValidatePayload(e.target.value)}
              rows={5}
              className="font-mono text-xs bg-zinc-950 border-zinc-800"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-sky-600 hover:bg-sky-500"
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
          <pre className="max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-emerald-300 whitespace-pre-wrap">
            {validateResult}
          </pre>
        ) : null}
        {selected ? (
          <p className="text-[10px] text-zinc-600">
            Selected: <span className="font-mono text-zinc-400">{selected.name}</span> · inputs keys:{" "}
            {Object.keys(selected.inputs || {}).length}
          </p>
        ) : null}
      </div>
    </div>
  );
}
