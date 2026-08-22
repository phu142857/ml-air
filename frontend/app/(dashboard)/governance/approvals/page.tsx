"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { ScopedListContent } from "@/components/mlops/scoped-list-content";
import { StatusBadge } from "@/components/mlops/status-badge";
import { useQuery } from "@tanstack/react-query";
import { fetchGovernanceApprovalQueue, type ApprovalQueueItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_APPROVALS } from "@/lib/scope-messages";
import { formatApiClientError, formatDateTimeCompact, formatRelativeTime } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";
import { modelApprovalDisplayLabel } from "@/lib/model-governance-ui";

const columns: DataTableColumn<ApprovalQueueItem>[] = [
  {
    id: "model",
    header: "Model",
    width: 180,
    getSearchValue: (r) => `${r.model_name} ${r.model_id}`,
    cell: (r) => (
      <Link href={`/models/${encodeURIComponent(r.model_id)}`} className="text-sm font-medium hover:underline">
        {r.model_name}
      </Link>
    ),
  },
  {
    id: "version",
    header: "Version",
    width: 90,
    getSortValue: (r) => r.version,
    cell: (r) => <span className="font-mono text-xs">{formatVersionLabel(r.version)}</span>,
  },
  {
    id: "status",
    header: "Status",
    width: 160,
    getSortValue: (r) => r.approval_status,
    cell: (r) => (
      <StatusBadge value={modelApprovalDisplayLabel(r.approval_status) || r.approval_status} />
    ),
  },
  {
    id: "updated",
    header: "Updated",
    width: 160,
    getSortValue: (r) => r.approval_updated_at || "",
    cell: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.approval_updated_at ? formatDateTimeCompact(r.approval_updated_at) : "—"}
      </span>
    ),
  },
];

export default function GovernanceApprovalsPage() {
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const queueQuery = useQuery({
    queryKey: mlairKeys.governance.approvalQueue(tenantId, projectId),
    queryFn: () => fetchGovernanceApprovalQueue(tenantId, projectId, token),
    enabled: scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        icon={ShieldCheck}
        accent="zinc"
        title="Approval queue"
      />
      {!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_APPROVALS} /> : null}
      <PageScrollBody>
        <ScopedListContent
          isLoading={queueQuery.isLoading}
          isError={queueQuery.isError}
          errorMessage={queueQuery.error ? formatApiClientError(queueQuery.error) : undefined}
          isEmpty={(queueQuery.data?.items ?? []).length === 0}
          emptyIcon={ShieldCheck}
          emptyTitle="No pending approvals"
        >
          <MlopsDataTable
            columns={columns}
            data={queueQuery.data?.items ?? []}
            keyExtractor={(r) => `${r.model_id}-${r.version}`}
            onRowClick={(r) => router.push(`/models/${encodeURIComponent(r.model_id)}`)}
          />
        </ScopedListContent>
      </PageScrollBody>
    </div>
  );
}
