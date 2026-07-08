"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Box, FolderUp, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { formatVersionLabel } from "@/lib/version-label"
import { useAppContext } from "@/lib/app-context"
import { createModel, type ModelItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_MODELS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { useToast } from "@/hooks/use-toast"
import { useModelsList } from "@/hooks/use-models-list"
import { ImportModelDialog } from "@/components/mlops/import-model-dialog"

const modelColumns: DataTableColumn<ModelItem>[] = [
  {
    id: "name",
    header: "Name",
    cell: (m) => <span className="text-sm font-medium text-foreground">{m.name}</span>,
  },
  {
    id: "model_id",
    header: "Model ID",
    cell: (m) => (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 font-mono text-xs">
        <span className="text-muted-foreground">{m.model_id}</span>
        {m.production_version != null ? (
          <span className="rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-1.5 py-0.5 text-[color:var(--status-success-fg)]">
            {formatVersionLabel(m.production_version)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "description",
    header: "Description",
    className: "max-w-xs",
    cell: (m) => (
      <span className="block truncate text-sm text-muted-foreground">{m.description || "—"}</span>
    ),
  },
  {
    id: "created",
    header: "Created",
    cell: (m) => <span className="text-xs text-muted-foreground">{formatRelativeTime(m.created_at)}</span>,
  },
  {
    id: "updated",
    header: "Updated",
    cell: (m) => <span className="text-xs text-muted-foreground">{formatRelativeTime(m.updated_at)}</span>,
  },
]

export default function ModelsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [registerOpen, setRegisterOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const modelsQuery = useModelsList(Boolean(token?.trim()))
  const showLoadMore = scopePinned && modelsQuery.hasNextPage

  const registerMutation = useMutation({
    mutationFn: () =>
      createModel(tenantId, projectId, token, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async (model) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId), exact: false })
      toast({ title: "Model registered", description: model.model_id })
      setRegisterOpen(false)
      setName("")
      setDescription("")
      router.push(`/models/${encodeURIComponent(model.model_id)}`)
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Registration failed", description: formatApiClientError(e) })
    },
  })

  const items = modelsQuery.items

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Box}
        accent="violet"
        title="Models"
        subtitle={isAggregate ? `All projects · ${items.length} models` : `${items.length} models`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-2 border-border bg-card"
              disabled={!token.trim() || !scopePinned}
              title={!scopePinned ? "Select a specific tenant and project" : undefined}
              onClick={() => setRegisterOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Register model
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-white disabled:text-white/90"
              disabled={!token.trim() || !scopePinned}
              title={!scopePinned ? "Select a specific tenant and project" : undefined}
              onClick={() => setImportOpen(true)}
            >
              <FolderUp className="h-3.5 w-3.5" />
              Import from local
            </Button>
          </div>
        }
      />

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register model</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Creates an empty registry entry. Use Import from local to add weights in the same step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="fraud-detector"
                className="border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none border-border bg-background"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="border-border" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary hover:bg-primary/90"
              disabled={!name.trim() || registerMutation.isPending}
              onClick={() => registerMutation.mutate()}
            >
              {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportModelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={(model) => router.push(`/models/${encodeURIComponent(model.model_id)}`)}
      />

      <PageScrollBody
        header={isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_MODELS} /> : null}
      >
        <ScopedListContent
          isLoading={modelsQuery.isLoading}
          isError={modelsQuery.isError}
          errorMessage={modelsQuery.error ? formatApiClientError(modelsQuery.error) : undefined}
          isEmpty={items.length === 0}
          emptyIcon={Box}
          emptyTitle="No models in this scope"
          emptyDescription="Import from local, register a model, or pick a workspace in the header."
          skeletonRows={5}
        >
          <MlopsDataTable
            columns={modelColumns}
            data={items}
            keyExtractor={(m) => m.model_id}
            onRowClick={(m) => router.push(`/models/${encodeURIComponent(m.model_id)}`)}
            emptyMessage="No models."
          />
          {showLoadMore ? (
            <div className="flex justify-center border-t border-border/60 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={modelsQuery.isFetchingNextPage}
                onClick={() => void modelsQuery.fetchNextPage?.()}
              >
                {modelsQuery.isFetchingNextPage ? "Loading…" : "Load more models"}
              </Button>
            </div>
          ) : null}
        </ScopedListContent>
      </PageScrollBody>
    </div>
  )
}
