"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRuns } from "@/lib/api";
import { OverviewSection } from "@/components/sections/overview-section";
import { RouteShell } from "@/components/layout/route-shell";
import { useAppContext } from "@/lib/app-context";

export default function DashboardPage() {
  const { tenantId, projectId, token } = useAppContext();
  const { data, isFetching } = useQuery({
    queryKey: ["runs", tenantId, projectId],
    queryFn: () => fetchRuns(tenantId, projectId, token)
  });

  const rows = data?.items ?? [];
  const stats = useMemo(() => {
    const success = rows.filter((r) => String(r.status).toUpperCase() === "SUCCESS").length;
    const failed = rows.filter((r) => String(r.status).toUpperCase() === "FAILED").length;
    const running = rows.filter((r) => String(r.status).toUpperCase() === "RUNNING").length;
    return { success, failed, running };
  }, [rows]);

  return (
    <RouteShell activeNav="Dashboard" title="Dashboard" subtitle="System overview and status distribution">
      <OverviewSection
        tenantId={tenantId}
        projectId={projectId}
        totalRuns={rows.length}
        isFetching={isFetching}
        success={stats.success}
        failed={stats.failed}
        running={stats.running}
      />
    </RouteShell>
  );
}
