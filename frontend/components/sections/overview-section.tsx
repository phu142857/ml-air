"use client";

import { RunsChart } from "@/components/dashboard/runs-chart";
import { StatusColumns } from "@/components/dashboard/status-columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  tenantId: string;
  projectId: string;
  totalRuns: number;
  isFetching: boolean;
  success: number;
  failed: number;
  running: number;
  pending: number;
};

export function OverviewSection({
  tenantId,
  projectId,
  totalRuns,
  isFetching,
  success,
  failed,
  running,
  pending
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="border-zinc-800 bg-zinc-900/40 shadow-none">
        <CardHeader>
          <CardTitle className="text-zinc-100">Run Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
        <StatusColumns success={success} failed={failed} pending={pending} />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/40 shadow-none">
        <CardHeader>
          <CardTitle className="text-zinc-100">Ops Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs text-zinc-300">
          {JSON.stringify({ tenantId, projectId, totalRuns, isFetching }, null, 2)}
        </pre>
        </CardContent>
      </Card>
    </div>
  );
}
