"use client";

import { RunItem } from "@/lib/api";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";
import { formatDateTimeCompact } from "@/lib/utils";

type Props = {
  rows: RunItem[];
  onSelectRun: (runId: string) => void;
  selectedForCompare?: string[];
  onToggleCompare?: (runId: string) => void;
};

export function RunsHistorySection({ rows, onSelectRun, selectedForCompare = [], onToggleCompare }: Props) {
  return (
    <section className="card p-5 shadow-md">
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left">Compare</th>
              <th className="px-3 py-2 text-left">Run ID</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Duration</th>
              <th className="px-3 py-2 text-left">Training Mode</th>
              <th className="px-3 py-2 text-left">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.run_id}
                className="interactive-row cursor-pointer border-t border-border"
                onClick={() => onSelectRun(row.run_id)}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedForCompare.includes(row.run_id)}
                    onChange={() => onToggleCompare?.(row.run_id)}
                  />
                </td>
                <td className="px-3 py-2">{row.run_id}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                    {normalizeStatus(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2">{String(row.training_mode || "full")}</td>
                <td className="px-3 py-2">{formatDateTimeCompact(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
