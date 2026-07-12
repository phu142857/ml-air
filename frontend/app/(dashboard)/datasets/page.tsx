"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Database, Plus, Search, Grid, List, CheckCircle2, Loader2 } from "lucide-react"
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
import { PageScrollBody, PageToolbar, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatRelativeTime, formatRowCount, formatApiClientError } from "@/lib/utils"
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

type ViewMode = "table" | "grid"

export default function DatasetsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [search, setSearch] = useState("")
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        String(d.dataset_id || "")
          .toLowerCase()
          .includes(q)
    )
  }, [items, search])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Database}
        accent="emerald"
        title="Datasets"
        subtitle={isAggregate ? `All projects · ${items.length} datasets` : `${items.length} datasets`}
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

      <PageToolbar>
        {viewMode === "grid" ? (
          <div className="relative">
            <Search
              strokeWidth={1.75}
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search datasets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 pl-9 text-sm"
            />
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "rounded-lg p-1.5 transition-default",
                viewMode === "table"
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-lg p-1.5 transition-default",
                viewMode === "grid"
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Grid className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </PageToolbar>

      <PageScrollBody
        variant={viewMode === "table" ? "workspace" : "scroll"}
        header={isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DATASETS} /> : null}
      >
        <ScopedListContent
          isLoading={datasetsQuery.isLoading}
          isError={datasetsQuery.isError}
          errorMessage={datasetsQuery.error ? formatApiClientError(datasetsQuery.error) : undefined}
          isEmpty={(viewMode === "table" ? items : filtered).length === 0}
          emptyIcon={Database}
          emptyTitle={
            viewMode === "grid" && search ? "No matching datasets" : "No datasets in this scope"
          }
          emptyDescription={
            viewMode === "grid" && search
              ? "Try a different search term."
              : "Upload a dataset or pick a workspace in the header."
          }
        >
        {viewMode === "table" ? (
          <MlopsDataTable
            className="min-h-0 flex-1"
            tableId="datasets-list"
            title="Datasets"
            description="Search, sort, and manage dataset inventory."
            columns={datasetTableColumns}
            data={items}
            keyExtractor={(d) => d.dataset_id}
            onRowClick={(d) => router.push(`/datasets/${encodeURIComponent(d.dataset_id)}`)}
            emptyMessage="No datasets match."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => (
              <Link
                key={d.dataset_id}
                href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                className="group min-w-0 transition-default"
              >
                <div className="h-full min-w-0 overflow-hidden rounded-2xl bg-muted/40 p-1 ring-1 ring-border/60">
                  <div className="flex h-full min-w-0 flex-col rounded-[calc(var(--radius)+2px)] bg-card p-5 sm:p-6">
                    <div className="mb-4 flex min-w-0 items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                          <Database
                            strokeWidth={1.75}
                            className="h-4 w-4 text-primary"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                            {d.name}
                          </h3>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {d.dataset_id}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] px-2 py-1 text-[10px] font-medium text-[color:var(--status-success-fg)]">
                        <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} />
                        listed
                      </span>
                    </div>
                    <div className="mt-auto space-y-2 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Rows</span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatRowCount(d.current_size)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-border/60 pt-2 text-muted-foreground">
                        <span>Updated</span>
                        <span className="tabular-nums">
                          {formatRelativeTime(d.updated_at || d.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
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
