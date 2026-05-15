"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Search, Loader2 } from "lucide-react"
import { searchApi, type SearchResultItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { ResourcePageHeader } from "@/components/layout/page-chrome"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatApiClientError } from "@/lib/utils"
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style"
import { normalizeSearchHref } from "@/lib/search-href"
import { isScopePinned } from "@/lib/scope"

type SearchType = "all" | "run" | "task" | "dataset"

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "run", label: "Runs" },
  { value: "task", label: "Tasks" },
  { value: "dataset", label: "Datasets" },
]

function resultLabel(it: SearchResultItem): string {
  return it.run_id || it.task_id || it.dataset_id || it.name || "—"
}

function SearchPageInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)

  const q = sp.get("q") || ""
  const type = (sp.get("type") as SearchType) || "all"
  const [input, setInput] = useState(q)

  useEffect(() => {
    setInput(q)
  }, [q])

  const searchQuery = useQuery({
    queryKey: mlairKeys.search(tenantId, projectId, q, type),
    queryFn: () => searchApi(tenantId, projectId, token, q, type),
    enabled: Boolean(q.trim() && token?.trim()),
  })

  const pushSearch = (nextQ: string, nextType: SearchType) => {
    const trimmed = nextQ.trim()
    if (!trimmed) {
      router.push("/search")
      return
    }
    const params = new URLSearchParams()
    params.set("q", trimmed)
    if (nextType !== "all") params.set("type", nextType)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="flex h-full flex-col">
      <ResourcePageHeader
        icon={Search}
        accent="sky"
        title="Search"
        subtitle="Runs, tasks, and datasets in the current tenant / project scope"
      />
      <div className="flex-1 overflow-auto p-6">
        <form
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            pushSearch(input, type)
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by id, name, pipeline…"
              className="h-9 border-zinc-800 bg-zinc-900 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={type === opt.value ? "default" : "outline"}
                className={cn(
                  "h-9",
                  type === opt.value
                    ? "bg-sky-600 text-white hover:bg-sky-500"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400",
                )}
                onClick={() => pushSearch(input || q, opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Button type="submit" className="h-9 bg-sky-600 hover:bg-sky-500" disabled={!input.trim()}>
            Search
          </Button>
        </form>

        {!scopePinned && q ? (
          <p className="mb-4 text-sm text-amber-400/90">
            Aggregate scope — searching up to 8 tenant/project pairs. Pin scope in the header for a single-project search.
          </p>
        ) : null}

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">
            {q ? (
              <>
                Results for <span className="font-mono text-zinc-100">“{q}”</span>
                {type !== "all" ? <span className="text-zinc-500"> · {type}</span> : null}
              </>
            ) : (
              "Enter a query above"
            )}
          </h2>
          <div className="space-y-2">
            {searchQuery.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : null}
            {searchQuery.isError ? (
              <p className="text-sm text-red-300">{formatApiClientError(searchQuery.error)}</p>
            ) : null}
            {(searchQuery.data?.items ?? []).map((it, i) => (
              <Link
                key={`${it.type}-${resultLabel(it)}-${i}`}
                href={normalizeSearchHref(it)}
                className={cn(
                  "block rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-200 transition-colors",
                  "hover:border-zinc-700 hover:bg-zinc-900/80",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase text-zinc-500">[{it.type}]</span>
                  <span className="font-medium text-zinc-100">{resultLabel(it)}</span>
                  {it.status ? (
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0 text-[10px] font-medium",
                        statusBadgeClass(it.status),
                      )}
                    >
                      {normalizeStatus(it.status)}
                    </span>
                  ) : null}
                </div>
                {it.scope_tenant_id ? (
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">
                    {it.scope_tenant_id} / {it.scope_project_id}
                  </p>
                ) : null}
                {it.pipeline_id ? <p className="mt-1 text-xs text-zinc-500">pipeline: {it.pipeline_id}</p> : null}
                {it.error_message ? <p className="mt-1 text-xs text-red-400">{it.error_message}</p> : null}
              </Link>
            ))}
            {q && !searchQuery.isLoading && !searchQuery.isError && (searchQuery.data?.items?.length ?? 0) === 0 ? (
              <p className="py-4 text-sm text-zinc-500">No results for this query.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col">
          <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
            <p className="text-sm text-zinc-500">Loading…</p>
          </div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  )
}
