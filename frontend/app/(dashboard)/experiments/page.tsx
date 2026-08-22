"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { ScopedListContent } from "@/components/mlops/scoped-list-content";
import { useExperimentsList } from "@/hooks/use-experiments-list";
import { useToast } from "@/hooks/use-toast";
import { createExperiment, type ExperimentItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { SCOPE_AGGREGATE_EXPERIMENTS } from "@/lib/scope-messages";
import { isScopePinned } from "@/lib/scope";
import { formatApiClientError, formatRelativeTime } from "@/lib/utils";

const columns: DataTableColumn<ExperimentItem>[] = [
  {
    id: "name",
    header: "Name",
    width: 220,
    canHide: false,
    getSearchValue: (e) => e.name,
    getSortValue: (e) => e.name,
    cell: (e) => <span className="text-sm font-medium text-foreground">{e.name}</span>,
  },
  {
    id: "experiment_id",
    header: "ID",
    width: 280,
    getSearchValue: (e) => e.experiment_id,
    cell: (e) => <span className="font-mono text-xs text-muted-foreground">{e.experiment_id}</span>,
  },
  {
    id: "description",
    header: "Description",
    width: 280,
    wrap: true,
    getSearchValue: (e) => e.description || "",
    cell: (e) => (
      <span className="block truncate text-sm text-muted-foreground">{e.description || "—"}</span>
    ),
  },
  {
    id: "created",
    header: "Created",
    width: 140,
    getSortValue: (e) => e.created_at,
    cell: (e) => (
      <span className="text-xs text-muted-foreground">{formatRelativeTime(e.created_at)}</span>
    ),
  },
];

export default function ExperimentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const experimentsQuery = useExperimentsList(Boolean(token?.trim()));

  const createMutation = useMutation({
    mutationFn: () =>
      createExperiment(tenantId, projectId, token, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async (exp) => {
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.experiments.listInfinite(tenantId, projectId),
      });
      toast({ title: "Experiment created", description: exp.name });
      setCreateOpen(false);
      setName("");
      setDescription("");
      router.push(`/experiments/${encodeURIComponent(exp.experiment_id)}`);
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: formatApiClientError(e),
      });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={FlaskConical}
        accent="violet"
        title="Experiments"
        actions={
          scopePinned ? (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New experiment
            </Button>
          ) : null
        }
      />
      {!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_EXPERIMENTS} /> : null}
      <PageScrollBody>
        <ScopedListContent
          isLoading={experimentsQuery.isLoading}
          isError={experimentsQuery.isError}
          errorMessage={experimentsQuery.error ? formatApiClientError(experimentsQuery.error) : undefined}
          isEmpty={experimentsQuery.items.length === 0}
          emptyIcon={FlaskConical}
          emptyTitle="No experiments"
        >
          <MlopsDataTable
            columns={columns}
            data={experimentsQuery.items}
            keyExtractor={(e) => e.experiment_id}
            onRowClick={(e) => router.push(`/experiments/${encodeURIComponent(e.experiment_id)}`)}
          />
          {experimentsQuery.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => experimentsQuery.fetchNextPage()}
              disabled={experimentsQuery.isFetchingNextPage}
            >
              {experimentsQuery.isFetchingNextPage ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Load more
            </Button>
          ) : null}
        </ScopedListContent>
      </PageScrollBody>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New experiment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-name">Name</Label>
              <Input
                id="exp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="yolov8-baseline"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Description</Label>
              <Textarea
                id="exp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
