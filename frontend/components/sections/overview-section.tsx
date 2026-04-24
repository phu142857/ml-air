"use client";

import { RunsChart } from "@/components/dashboard/runs-chart";

type Props = {
  tenantId: string;
  projectId: string;
  totalRuns: number;
  isFetching: boolean;
  success: number;
  failed: number;
  running: number;
};

export function OverviewSection({
  tenantId,
  projectId,
  totalRuns,
  isFetching,
  success,
  failed,
  running
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Run Status Distribution</h2>
        <RunsChart success={success} failed={failed} running={running} />
      </section>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Pipeline Info</h2>
        <pre className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {JSON.stringify({ tenantId, projectId, totalRuns, isFetching }, null, 2)}
        </pre>
      </section>
    </div>
  );
}
