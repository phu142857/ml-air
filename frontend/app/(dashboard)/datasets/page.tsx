"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Database, Plus } from "lucide-react"
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
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { formatRelativeTime, formatRowCount, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import {
  previewDatasetUpload,
  uploadDatasetCsv,
  type DatasetItem,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useDatasetsList } from "@/hooks/use-datasets-list"
import { SCOPE_AGGREGATE_DATASETS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { useToast } from "@/hooks/use-toast"
import { toastSuccess } from "@/lib/toast-actions"

const datasetTableColumns: DataTableColumn<DatasetItem>[] = [
  {
    id: "name",
    header: "Name",
    width: 240,
    canHide: false,
    getSearchValue: (d) => d.name,
    getSortValue: (d) => d.name,
    cell: (d) => (
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{d.name}</span>
      </div>
    ),
  },
  {
    id: "dataset_id",
    header: "Dataset ID",
    width: 260,
    getSearchValue: (d) => d.dataset_id,
    getSortValue: (d) => d.dataset_id,
    cell: (d) => <span className="font-mono text-xs text-muted-foreground">{d.dataset_id}</span>,
  },
  {
    id: "rows",
    header: "Rows",
    width: 120,
    getSortValue: (d) => Number(d.current_size || 0),
    getSearchValue: (d) => String(d.current_size ?? ""),
    cell: (d) => (
      <span className="font-mono text-sm text-muted-foreground">{formatRowCount(d.current_size)}</span>
    ),
  },
  {
    id: "checksum",
    header: "Checksum",
    width: 180,
    getSearchValue: (d) => d.checksum || "",
    getSortValue: (d) => d.checksum || "",
    cell: (d) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground/80">
        {d.checksum || "—"}
      </span>
    ),
  },
  {
    id: "updated",
    header: "Updated",
    width: 140,
    getSortValue: (d) => d.updated_at || d.created_at || "",
    cell: (d) => (
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(d.updated_at || d.created_at)}
      </span>
    ),
  },
]

export default function DatasetsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [uploadOpen, setUploadOpen] = useState(false)
  const [datasetName, setDatasetName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<number | null>(null)

  const datasetsQuery = useDatasetsList(Boolean(token?.trim()))

  const items = datasetsQuery.items
  const showLoadMore = datasetsQuery.scopePinned && datasetsQuery.hasNextPage

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a CSV file")
      return uploadDatasetCsv(tenantId, projectId, token, {
        dataset_name: datasetName.trim(),
        file,
      })
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId), exact: false })
      const merged = typeof result.merged_rows === "number"
      toast({
        title: "Dataset uploaded",
        description: merged
          ? `${result.dataset_name} · +${result.merged_rows} rows · ${result.record_count} total`
          : `${result.dataset_name} · ${result.row_count} rows · ${result.status}`,
      })
      setUploadOpen(false)
      setDatasetName("")
      setFile(null)
      setPreviewRows(null)
      router.push(`/datasets/${encodeURIComponent(result.dataset_id)}`)
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Upload failed", description: formatApiClientError(e) })
    },
  })

  const previewMutation = useMutation({
    mutationFn: (f: File) => previewDatasetUpload(tenantId, projectId, token, f),
    onSuccess: (data) => {
      setPreviewRows(data.row_count)
      toastSuccess("Preview ready", `${data.row_count.toLocaleString()} rows detected`)
    },
    onError: () => {
      setPreviewRows(null)
      toast({ variant: "destructive", title: "Preview failed", description: "Could not parse the selected file." })
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Database}
        accent="emerald"
        title="Datasets"
        actions={
          <Button
            type="button"
            size="sm"
            className="h-8 gap-2"
            disabled={!token.trim() || !scopePinned}
            title={!scopePinned ? "Select a specific tenant and project" : undefined}
            onClick={() => setUploadOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Upload dataset
          </Button>
        }
      />

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload dataset (CSV)</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Creates a dataset and immutable version from a CSV file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Dataset name</Label>
              <Input
                value={datasetName}
                onChange={(e) => {
                  setDatasetName(e.target.value)
                }}
                placeholder="customer_transactions"
                className="border-border bg-background font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                className="border-border bg-background text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setPreviewRows(null)
                  if (f && scopePinned && token.trim()) previewMutation.mutate(f)
                }}
              />
              {previewMutation.isPending ? (
                <p className="text-xs text-muted-foreground">Previewing…</p>
              ) : previewRows != null ? (
                <p className="text-xs text-muted-foreground">Preview: ~{previewRows} rows</p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="border-border" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!datasetName.trim() || !file}
              loading={uploadMutation.isPending}
              loadingText="Uploading…"
              onClick={() => uploadMutation.mutate()}
            >
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageScrollBody
        variant="workspace"
        header={isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DATASETS} /> : null}
      >
        <ScopedListContent
          isLoading={datasetsQuery.isLoading}
          isError={datasetsQuery.isError}
          errorMessage={datasetsQuery.error ? formatApiClientError(datasetsQuery.error) : undefined}
          isEmpty={items.length === 0}
          emptyIcon={Database}
          emptyTitle="No datasets"
          emptyDescription=""
        >
          <MlopsDataTable
            className="min-h-0 flex-1"
            tableId="datasets-list"
            columns={datasetTableColumns}
            data={items}
            keyExtractor={(d) => d.dataset_id}
            onRowClick={(d) => router.push(`/datasets/${encodeURIComponent(d.dataset_id)}`)}
            emptyMessage="No datasets match."
            loading={datasetsQuery.isRefetching && items.length > 0}
            stickyFirstColumn
          />
          {showLoadMore ? (
            <div className="flex justify-center border-t border-border/60 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={datasetsQuery.isFetchingNextPage}
                onClick={() => void datasetsQuery.fetchNextPage?.()}
              >
                {datasetsQuery.isFetchingNextPage ? "Loading…" : "Load more datasets"}
              </Button>
            </div>
          ) : null}
        </ScopedListContent>
      </PageScrollBody>
    </div>
  )
}
