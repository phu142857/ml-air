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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatRelativeTime, formatRowCount, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchDatasets, previewDatasetUpload, uploadDatasetCsv } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useToast } from "@/hooks/use-toast"

type ViewMode = "table" | "grid"

export default function DatasetsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = tenantId !== "all" && projectId !== "all"
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
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10">
              <Database className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Datasets</h1>
              <p className="text-xs text-zinc-500">
                Scope <span className="font-mono text-zinc-400">{tenantId}</span> /{" "}
                <span className="font-mono text-zinc-400">{projectId}</span>
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            disabled={!token.trim() || !scopePinned}
            title={!scopePinned ? "Select a specific tenant and project" : undefined}
            onClick={() => setUploadOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Dataset
          </Button>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload dataset (CSV)</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Creates a dataset and immutable version from a CSV file.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Dataset name</Label>
                  <Input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="customer_transactions"
                    className="border-zinc-800 bg-zinc-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">CSV file</Label>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    className="border-zinc-800 bg-zinc-900 text-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setFile(f)
                      setPreviewRows(null)
                      if (f && scopePinned && token.trim()) previewMutation.mutate(f)
                    }}
                  />
                  {previewMutation.isPending ? (
                    <p className="text-xs text-zinc-500">Previewing…</p>
                  ) : previewRows != null ? (
                    <p className="text-xs text-zinc-500">Preview: ~{previewRows} rows</p>
                  ) : null}
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" className="border-zinc-700" onClick={() => setUploadOpen(false)}>
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
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-zinc-900/30 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Search datasets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 border-zinc-800 bg-zinc-900 pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-md border border-zinc-800">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "table" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "grid" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {datasetsQuery.isError ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {formatApiClientError(datasetsQuery.error)}
          </div>
        ) : null}

        {datasetsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <span className="text-sm">Loading datasets…</span>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="font-medium text-zinc-500">Name</TableHead>
                  <TableHead className="font-medium text-zinc-500">Dataset ID</TableHead>
                  <TableHead className="font-medium text-zinc-500">Rows</TableHead>
                  <TableHead className="font-medium text-zinc-500">Checksum</TableHead>
                  <TableHead className="font-medium text-zinc-500">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-zinc-500">
                      No datasets match this filter (or list is empty).
                    </TableCell>
                  </TableRow>
                ) : null}
                {filtered.map((d) => (
                  <TableRow key={d.dataset_id} className="cursor-pointer border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell>
                      <Link
                        href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                        className="flex items-center gap-2 text-zinc-200 hover:text-sky-400"
                      >
                        <Database className="h-4 w-4 text-zinc-600" />
                        <span className="text-sm font-medium">{d.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-zinc-400">{d.dataset_id}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-zinc-400">{formatRowCount(d.current_size)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="max-w-[180px] truncate font-mono text-[10px] text-zinc-500">
                        {d.checksum || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-zinc-500">{formatRelativeTime(d.updated_at || d.created_at)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-zinc-500">No datasets to show.</div>
            ) : null}
            {filtered.map((d) => (
              <Link
                key={d.dataset_id}
                href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-emerald-500" />
                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">{d.name}</h3>
                      <p className="font-mono text-[10px] text-zinc-600">{d.dataset_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 bg-emerald-500/10">
                    <CheckCircle2 className="h-3 w-3" />
                    listed
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-500">
                    <span>Rows</span>
                    <span className="font-mono text-zinc-300">{formatRowCount(d.current_size)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-800 pt-2 text-zinc-600">
                    <span>Updated</span>
                    <span>{formatRelativeTime(d.updated_at || d.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
