"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatRelativeTime, formatRowCount, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchDatasets, previewDatasetUpload, uploadDatasetCsv, type DatasetItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_DATASETS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { useToast } from "@/hooks/use-toast"

const datasetTableColumns: DataTableColumn<DatasetItem>[] = [
  {
    id: "name",
    header: "Name",
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
    cell: (d) => <span className="font-mono text-xs text-muted-foreground">{d.dataset_id}</span>,
  },
  {
    id: "rows",
    header: "Rows",
    cell: (d) => (
      <span className="font-mono text-sm text-muted-foreground">{formatRowCount(d.current_size)}</span>
    ),
  },
  {
    id: "checksum",
    header: "Checksum",
    className: "max-w-[180px]",
    cell: (d) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground/80">
        {d.checksum || "—"}
      </span>
    ),
  },
  {
    id: "updated",
    header: "Updated",
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

  const datasetsQuery = useQuery({
    queryKey: mlairKeys.datasets.list(tenantId, projectId),
    queryFn: () => fetchDatasets(tenantId, projectId, token),
    enabled: Boolean(token?.trim())
  })

  const items = datasetsQuery.data?.items ?? []

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a CSV file")
      return uploadDatasetCsv(tenantId, projectId, token, { dataset_name: datasetName.trim(), file })
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId), exact: false })
      toast({
        title: "Dataset uploaded",
        description: `${result.dataset_name} · ${result.row_count} rows · ${result.status}`,
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
    onSuccess: (data) => setPreviewRows(data.row_count),
    onError: () => setPreviewRows(null),
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
    <div className="flex min-h-0 flex-1 flex-col">
      <ResourcePageHeader
        icon={Database}
        accent="emerald"
        title="Datasets"
        subtitle={isAggregate ? `All projects · ${items.length} datasets` : `${items.length} datasets`}
        actions={
          <Button
            type="button"
            size="sm"
            className="h-8 gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
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
                onChange={(e) => setDatasetName(e.target.value)}
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
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={!datasetName.trim() || !file || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border-b border-border bg-muted/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search datasets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 border-border bg-card pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_DATASETS} /> : null}
        <ScopedListContent
          isLoading={datasetsQuery.isLoading}
          isError={datasetsQuery.isError}
          errorMessage={datasetsQuery.error ? formatApiClientError(datasetsQuery.error) : undefined}
          isEmpty={filtered.length === 0}
          emptyIcon={Database}
          emptyTitle={search ? "No matching datasets" : "No datasets in this scope"}
          emptyDescription={
            search ? "Try a different search term." : "Upload a dataset or pick a workspace in the header."
          }
        >
        {viewMode === "table" ? (
          <MlopsDataTable
            columns={datasetTableColumns}
            data={filtered}
            keyExtractor={(d) => d.dataset_id}
            onRowClick={(d) => router.push(`/datasets/${encodeURIComponent(d.dataset_id)}`)}
            emptyMessage="No datasets match."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
{filtered.map((d) => (
              <Link
                key={d.dataset_id}
                href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                className="rounded-lg border border-border bg-card/80 p-4 transition-colors hover:bg-card"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-emerald-500" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{d.name}</h3>
                      <p className="font-mono text-[10px] text-muted-foreground/80">{d.dataset_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 bg-emerald-500/10">
                    <CheckCircle2 className="h-3 w-3" />
                    listed
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Rows</span>
                    <span className="font-mono text-foreground/90">{formatRowCount(d.current_size)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-muted-foreground/80">
                    <span>Updated</span>
                    <span>{formatRelativeTime(d.updated_at || d.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        </ScopedListContent>
      </div>
    </div>
  )
}
