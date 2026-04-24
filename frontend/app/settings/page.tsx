"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchPlugins, reloadPlugins, togglePlugin, validatePlugin } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { token } = useAppContext();
  const [selectedPlugin, setSelectedPlugin] = useState("");
  const [validatePayload, setValidatePayload] = useState('{"name":"mlair"}');
  const [validateResult, setValidateResult] = useState("");

  const pluginsQuery = useQuery({
    queryKey: ["plugins"],
    queryFn: () => fetchPlugins(token)
  });

  const items = pluginsQuery.data?.items ?? [];
  const errors = pluginsQuery.data?.errors ?? [];

  const selected = useMemo(() => items.find((x) => x.name === selectedPlugin) ?? null, [items, selectedPlugin]);

  const reloadMutation = useMutation({
    mutationFn: () => reloadPlugins(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plugins"] });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => togglePlugin(name, enabled, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plugins"] });
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
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Plugin Registry</h2>
            <button
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 disabled:opacity-60"
              onClick={() => reloadMutation.mutate()}
              disabled={reloadMutation.isPending}
            >
              Reload Plugins
            </button>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
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
                    className={`border-t border-slate-800 ${selectedPlugin === plugin.name ? "bg-slate-800/80" : "hover:bg-slate-800/60"}`}
                    onClick={() => setSelectedPlugin(plugin.name)}
                  >
                    <td className="px-3 py-2">{plugin.name}</td>
                    <td className="px-3 py-2">{plugin.version}</td>
                    <td className="px-3 py-2">{plugin.enabled ? "on" : "off"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMutation.mutate({ name: plugin.name, enabled: !plugin.enabled });
                        }}
                      >
                        {plugin.enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td className="px-3 py-3 text-slate-400" colSpan={4}>
                      {pluginsQuery.isLoading ? "Loading plugins..." : "No plugins discovered"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
        </section>

        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Plugin Detail</h2>
          {selected ? (
            <div className="space-y-3 text-sm text-slate-200">
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <div className="text-xs text-slate-400">Metadata</div>
                <div className="mt-1">
                  {selected.name} v{selected.version} (engine {selected.engine_version})
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <div className="mb-1 text-xs text-slate-400">UI Schema</div>
                <pre className="overflow-auto text-xs text-slate-300">
                  {JSON.stringify(selected.ui_schema ?? { note: "plugin does not expose ui_schema" }, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <div className="mb-1 text-xs text-slate-400">Validate Context</div>
                <textarea
                  className="h-28 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200"
                  value={validatePayload}
                  onChange={(e) => setValidatePayload(e.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
                    onClick={onValidate}
                    disabled={validateMutation.isPending}
                  >
                    Validate
                  </button>
                </div>
                {validateResult && (
                  <pre className="mt-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">
                    {validateResult}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">
              Select a plugin from the registry table.
            </div>
          )}
        </section>
      </div>
    </RouteShell>
  );
}
