"use client"

import { useQuery } from "@tanstack/react-query"
import { Network } from "lucide-react"

import { DashboardBoard, DashboardKpiStrip } from "@/components/mlops/dashboard"
import {
  PageScrollBody,
  ResourcePageHeader,
  ScopePinnedInline,
} from "@/components/mlops/layout"
import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"

import { useDashboardStats } from "@/hooks/use-dashboard-stats"

import { fetchAuditTimeline, fetchAuditTimelinePage } from "@/lib/api"
import type { AuditTimelineItem } from "@/lib/api"
import { useAppContext } from "@/lib/app-context"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_DASHBOARD } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { formatApiClientError } from "@/lib/utils"

export default function DashboardPage() {
  const { tenantId, projectId, token } = useAppContext()

  const scopePinned = isScopePinned(tenantId, projectId)
  const showProjectUsage = scopePinned
  const showTenantUsage = !scopePinned && tenantId !== "all"

  const {
    isLoading,
    isAggregate,
    stats,
    datasets,
    pipelines,
    runs,
    runningPipelines,
    failedRuns,
  } = useDashboardStats()

  const auditQ = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, {}),
    queryFn: async () => {
      if (scopePinned) {
        const page = await fetchAuditTimelinePage(tenantId, projectId, token, { limit: 12 })
        return { items: page.items }
      }
      const res = await fetchAuditTimeline(tenantId, projectId, token, { limit: 12 })
      return { items: res.items }
    },
    enabled: Boolean(token?.trim()),
  })

  const blockedReadinessCount =
    typeof stats[0]?.blocked === "number" ? stats[0].blocked : 0

  const auditEvents: AuditTimelineItem[] = (auditQ.data?.items ?? []) as AuditTimelineItem[]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Network}
        accent="sky"
        title="Dashboard"
      />

      <PageScrollBody
        header={
          isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DASHBOARD} /> : null
        }
      >
        {isLoading ? (
          <ListTableSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-4">
            <DashboardKpiStrip stats={stats} />
            <DashboardBoard
              runs={runs}
              pipelines={pipelines}
              datasets={datasets}
              runningPipelines={runningPipelines}
              failedRuns={failedRuns}
              auditEvents={auditEvents}
              auditLoading={auditQ.isLoading}
              auditError={auditQ.isError ? formatApiClientError(auditQ.error) : undefined}
              blockedReadinessCount={blockedReadinessCount}
              tenantId={tenantId}
              projectId={projectId}
              token={token}
              scopePinned={scopePinned}
              showProjectUsage={showProjectUsage}
              showTenantUsage={showTenantUsage}
            />
          </div>
        )}
      </PageScrollBody>
    </div>
  )
}
