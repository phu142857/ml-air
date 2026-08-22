"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Radio } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsEmptyState } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/app-context";
import { fetchEdgeNodes, syncEdgeNode, type EdgeNodeItem } from "@/lib/distributed-api";
import { resolveInfraRefetchInterval } from "@/lib/realtime-query-polling";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

export function EdgeNodesPanel() {
  const { token } = useAppContext();
  const queryClient = useQueryClient();
  const poll = { refetchInterval: resolveInfraRefetchInterval() };

  const query = useQuery({
    queryKey: ["distributed-edge-nodes"],
    queryFn: () => fetchEdgeNodes(token),
    enabled: Boolean(token?.trim()),
    ...poll,
  });

  const syncMutation = useMutation({
    mutationFn: (edgeId: string) => syncEdgeNode(token, edgeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distributed-edge-nodes"] });
      toastSuccess("Edge sync triggered");
    },
    onError: (e) => toastError("Sync failed", formatApiClientError(e)),
  });

  const columns: DataTableColumn<EdgeNodeItem>[] = [
    { id: "name", header: "Name", width: 160, cell: (r) => <span className="text-sm">{r.name}</span> },
    {
      id: "cluster",
      header: "Cluster",
      width: 180,
      cell: (r) => <span className="font-mono text-xs">{r.cluster_id}</span>,
    },
    { id: "kind", header: "Kind", width: 100, cell: (r) => <span className="text-xs">{r.deployment_kind}</span> },
    { id: "mode", header: "Sync", width: 100, cell: (r) => <span className="text-xs">{r.sync_mode}</span> },
    {
      id: "synced",
      header: "Last sync",
      width: 160,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.last_sync_at ? formatDateTimeCompact(r.last_sync_at) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: 100,
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate(r.edge_id)}
        >
          {syncMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          <span className="ml-1">Sync</span>
        </Button>
      ),
    },
  ];

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading edge nodes…</p>;
  if (query.error) return <p className="text-sm text-destructive">{formatApiClientError(query.error)}</p>;

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return (
      <MlopsEmptyState
        icon={Radio}
        title="No edge nodes"
        description="Register edge nodes via API or run mlair seed distributed."
      />
    );
  }

  return <DataTable columns={columns} data={items} keyExtractor={(r) => r.edge_id} />;
}
