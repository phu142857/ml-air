"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRuns } from "@/lib/api";
import { OverviewSection } from "@/components/sections/overview-section";
import { RouteShell } from "@/components/layout/route-shell";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";

export default function DashboardPage() {
  const { tenantId, projectId, token } = useAppContext();
  const { data, isFetching } = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });

  const rows = data?.items ?? [];
  const stats = useMemo(() => {
    const success = rows.filter((r) => String(r.status).toUpperCase() === "SUCCESS").length;
    const failed = rows.filter((r) => String(r.status).toUpperCase() === "FAILED").length;
    const running = rows.filter((r) => String(r.status).toUpperCase() === "RUNNING").length;
    const pending = rows.filter((r) => String(r.status).toUpperCase() === "PENDING").length;
    return { success, failed, running, pending };
  }, [rows]);

  return (
    <RouteShell activeNav="Dashboard" title="Dashboard" subtitle="System overview and status distribution">
      {isFetching && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
        </div>
      ) : (
        <OverviewSection
          tenantId={tenantId}
          projectId={projectId}
          totalRuns={rows.length}
          isFetching={isFetching}
          success={stats.success}
          failed={stats.failed}
          running={stats.running}
          pending={stats.pending}
        />
      )}
    </RouteShell>
  );
}
