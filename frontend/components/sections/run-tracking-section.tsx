"use client";

import { RunTracking } from "@/lib/api";

type Props = {
  tracking: RunTracking | null;
};

export function RunTrackingSection({ tracking }: Props) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-primary">
        Metrics / Params / Artifacts
      </h2>

      {!tracking ? (
        <div className="rounded-xl border border-default bg-muted p-3 text-sm text-disabled">
          No tracking data.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Params */}
          <div className="card p-3">
            <div className="mb-2 text-xs font-semibold text-secondary">
              Params
            </div>
            <pre className="code-block max-h-52 overflow-auto">
              {JSON.stringify(tracking.params, null, 2)}
            </pre>
          </div>

          {/* Metrics */}
          <div className="card p-3">
            <div className="mb-3 text-xs font-semibold text-secondary">
              Metrics
            </div>

            <div className="space-y-2">
              {(() => {
                if (!tracking.metrics) return null;
                
                // Handle array vs object structure
                const metricsArray = Array.isArray(tracking.metrics) 
                  ? tracking.metrics 
                  : Object.entries(tracking.metrics).map(([key, metric]) => ({ key, value: metric }));
                
                return metricsArray.map((metric, i) => {
                  const val = metric?.value ?? metric;
                  const displayKey = metric.key ?? (Array.isArray(tracking.metrics) ? i : metric.key);
                  
                  return (
                    <div key={i} className="flex justify-between items-center">
                      <span className="metric-key">{displayKey}</span>
                      <span className="metric-value">
                        {typeof val === "number" ? val.toFixed(4) : String(val)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Artifacts */}
          <div className="card p-3">
            <div className="mb-3 text-xs font-semibold text-secondary">
              Artifacts
            </div>

            <div className="max-h-52 overflow-auto rounded-lg border border-default">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-left text-secondary">Path</th>
                    <th className="px-2 py-2 text-left text-secondary">URI</th>
                  </tr>
                </thead>

                <tbody>
                  {tracking.artifacts.map((artifact, i) => (
                    <tr
                      key={artifact.artifact_id}
                      className={`
                        border-t border-default
                        ${i % 2 === 0 ? "bg-surface" : "bg-muted"}
                        hover:bg-info transition
                      `}
                    >
                      <td className="px-2 py-2">{artifact.path}</td>
                      <td className="px-2 py-2">
                        {artifact.uri ? (
                          <a
                            href={artifact.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="link"
                          >
                            {artifact.uri}
                          </a>
                        ) : (
                          <span className="text-disabled">-</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!tracking.artifacts.length && (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-2 py-3 text-center text-disabled"
                      >
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