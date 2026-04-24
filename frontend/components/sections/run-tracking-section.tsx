"use client";

import { RunTracking } from "@/lib/api";

type Props = {
  tracking: RunTracking | null;
};

export function RunTrackingSection({ tracking }: Props) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Metrics / Params / Artifacts</h2>
      {!tracking ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">No tracking data.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">Params</div>
            <pre className="max-h-52 overflow-auto text-xs text-slate-300">
              {JSON.stringify(tracking.params, null, 2)}
            </pre>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">Metrics</div>
            <pre className="max-h-52 overflow-auto text-xs text-slate-300">
              {JSON.stringify(tracking.metrics, null, 2)}
            </pre>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">Artifacts</div>
            <div className="max-h-52 overflow-auto rounded-md border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Path</th>
                    <th className="px-2 py-1 text-left">URI</th>
                  </tr>
                </thead>
                <tbody>
                  {tracking.artifacts.map((artifact) => (
                    <tr key={artifact.artifact_id} className="border-t border-slate-800 text-slate-300">
                      <td className="px-2 py-1">{artifact.path}</td>
                      <td className="px-2 py-1">
                        {artifact.uri ? (
                          <a
                            href={artifact.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 underline decoration-dotted"
                          >
                            {artifact.uri}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                  {!tracking.artifacts.length && (
                    <tr>
                      <td className="px-2 py-2 text-slate-500" colSpan={2}>
                        No artifacts logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
