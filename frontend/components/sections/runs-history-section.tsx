"use client";

import { RunItem } from "@/lib/api";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";
import { formatDateTimeCompact } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";

type Props = {
  rows: RunItem[];
  onSelectRun: (runId: string) => void;
  selectedForCompare?: string[];
  onToggleCompare?: (runId: string) => void;
};

export function RunsHistorySection({ rows, onSelectRun, selectedForCompare = [], onToggleCompare }: Props) {
  return (
    <Card className="gap-4 border-zinc-800 bg-zinc-900/40 py-4 shadow-none">
      <CardContent className="space-y-0 px-4">
        <DataTableShell>
          <DataTable className="text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Compare</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Run ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Duration</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Training Mode</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.run_id}
                className="interactive-row cursor-pointer border-t border-zinc-800"
                onClick={() => onSelectRun(row.run_id)}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedForCompare.includes(row.run_id)}
                    onChange={() => onToggleCompare?.(row.run_id)}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.run_id}</td>
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
          </DataTable>
        </DataTableShell>
      </CardContent>
    </Card>
  );
}
