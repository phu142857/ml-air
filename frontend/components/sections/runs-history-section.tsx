"use client";

import { RunItem } from "@/lib/api";

type Props = {
  rows: RunItem[];
  onSelectRun: (runId: string) => void;
  selectedForCompare?: string[];
  onToggleCompare?: (runId: string) => void;
};

export function RunsHistorySection({ rows, onSelectRun, selectedForCompare = [], onToggleCompare }: Props) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Runs History</h2>
      <div className="overflow-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Compare</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Run ID</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Status</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Duration</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Trigger</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.run_id}
                className="cursor-pointer border-b border-slate-800 hover:bg-slate-800/70"
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
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2">manual</td>
                <td className="px-3 py-2">{String(row.updated_at || "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
