"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, Loader2, Play } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/app-context";
import { createDrSnapshot, fetchDrSnapshots, restoreDrSnapshot, type DrSnapshotItem } from "@/lib/distributed-api";
import { resolveInfraRefetchInterval } from "@/lib/realtime-query-polling";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

export function DrSnapshotsPanel() {
  const { token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = { refetchInterval: resolveInfraRefetchInterval() };

  const query = useQuery({
    queryKey: ["distributed-dr-snapshots"],
    queryFn: () => fetchDrSnapshots(token),
    enabled: Boolean(token?.trim()),
    ...poll,
  });

  const createMutation = useMutation({
    mutationFn: () => createDrSnapshot(token, { scope: "global" }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: ["distributed-dr-snapshots"] });
      toastSuccess("Snapshot created", out.snapshot_id);
    },
    onError: (e) => toastError("Create failed", formatApiClientError(e)),
  });

  const restoreMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreDrSnapshot(token, snapshotId, true),
    onSuccess: (out) => {
      toastSuccess("Dry-run restore OK", JSON.stringify(out).slice(0, 120));
    },
    onError: (e) => toastError("Restore failed", formatApiClientError(e)),
  });

  const columns: DataTableColumn<DrSnapshotItem>[] = [
    {
      id: "id",
      header: "Snapshot",
      width: 220,
      cell: (r) => <span className="font-mono text-xs">{r.snapshot_id}</span>,
    },
    { id: "scope", header: "Scope", width: 100, cell: (r) => <span className="text-xs">{r.scope}</span> },
    {
      id: "region",
      header: "Region",
      width: 140,
      cell: (r) => <span className="font-mono text-xs">{r.region_id ?? "—"}</span>,
    },
    {
      id: "at",
      header: "Created",
      width: 160,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.created_at ? formatDateTimeCompact(r.created_at) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: 120,
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={restoreMutation.isPending}
          onClick={() => restoreMutation.mutate(r.snapshot_id)}
        >
          {restoreMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
          <span className="ml-1">Dry-run</span>
        </Button>
      ),
    },
  ];

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading DR snapshots…</p>;
  if (query.error) return <p className="text-sm text-destructive">{formatApiClientError(query.error)}</p>;

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <DatabaseBackup className="mr-2 size-4" />}
          Create snapshot
        </Button>
      </div>
      {items.length === 0 ? (
        <MlopsEmptyState
          icon={DatabaseBackup}
          title="No DR snapshots"
          description="Create a metadata snapshot for disaster recovery dry-run."
        />
      ) : (
        <DataTable columns={columns} data={items} keyExtractor={(r) => r.snapshot_id} />
      )}
    </div>
  );
}
