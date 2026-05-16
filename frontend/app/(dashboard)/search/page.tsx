"use client"

import { Suspense, useDeferredValue, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ChevronRight, Database, ListTodo, Loader2, Play, Search } from "lucide-react"
import { searchApi, type SearchResultItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import {
  FilterChips,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
} from "@/components/mlops/layout"
import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { StatusBadge } from "@/components/mlops/status-badge"
import { SCOPE_AGGREGATE_SEARCH } from "@/lib/scope-messages"
import { normalizeSearchHref } from "@/lib/search-href"
import { isScopePinned } from "@/lib/scope"
import { statusToMlopsBadge } from "@/lib/status-style"
import { cn, formatApiClientError, formatRelativeTime } from "@/lib/utils"

type SearchType = "all" | "run" | "task" | "dataset"

const filterOptions = [
  { id: "all", label: "All" },
  { id: "run", label: "Runs" },
  { id: "task", label: "Tasks" },
  { id: "dataset", label: "Datasets" },
]

function resultLabel(it: SearchResultItem): string {
  return it.run_id || it.task_id || it.dataset_id || it.name || "—"
}

function statusForItem(it: SearchResultItem) {
  return statusToMlopsBadge(it.status)
}

function TypeIcon({ type }: { type: SearchResultItem["type"] }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground"
  if (type === "run") return <Play className={cls} aria-hidden />
  if (type === "task") return <ListTodo className={cls} aria-hidden />
  return <Database className={cls} aria-hidden />
}

function SearchSkeleton() {
  return (
    <div className="divide-y divide-border/80 overflow-hidden rounded-lg border border-border bg-card/80">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-3">
          <div className="h-8 w-8 rounded-md bg-muted/80" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-48 rounded bg-muted/80" />
            <div className="h-2 w-32 rounded bg-muted/60" />
          </div>
          <div className="h-6 w-16 rounded-md bg-muted/80" />
          <div className="h-3 w-14 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

function SearchPageInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const { tenantId, projectId, token } = useAppContext()
  const isAggregate = !isScopePinned(tenantId, projectId)

  const q = sp.get("q") || ""
  const type = (sp.get("type") as SearchType) || "all"
  const [input, setInput] = useState(q)
  const deferredQ = useDeferredValue(q.trim())
  const isSearchStale = q.trim() !== deferredQ

  useEffect(() => {
    setInput(q)
  }, [q])

  const searchQuery = useQuery({
    queryKey: mlairKeys.search(tenantId, projectId, deferredQ, type),
    queryFn: () => searchApi(tenantId, projectId, token, deferredQ, type),
    enabled: Boolean(deferredQ && token?.trim()),
  })

  const items = searchQuery.data?.items ?? []

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

  const scopeHint = isAggregate
    ? "Searching merged scopes (API limits). Pin one workspace to narrow results."
    : null

  const showSkeleton = isSearchStale && input.trim().length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResourcePageHeader
        icon={Search}
        accent="sky"
        title="Search"
        subtitle="Runs, tasks, and datasets by id or keyword"
      />

      <div className="flex-1 space-y-5 overflow-auto p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_SEARCH} /> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterChips
            options={filterOptions}
            value={type}
            onChange={(id) => pushSearch(input || q, id as SearchType)}
            variant="sky"
          />
          {scopeHint ? (
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{scopeHint}</p>
          ) : null}
        </div>

        <form
          className="rounded-lg border border-border bg-card/80 p-1 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            pushSearch(input, type)
          }}
        >
          <label htmlFor="global-search" className="sr-only">
            Search workspace
          </label>
          <input
            id="global-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by run id, task id, dataset name, or status…"
            className={cn(
              "w-full rounded-md border-0 bg-transparent px-4 py-3.5 text-base text-foreground",
              "placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-sky-500/40",
            )}
            autoComplete="off"
          />
        </form>

        {showSkeleton ? (
          <SearchSkeleton />
        ) : !deferredQ ? (
          <MlopsEmptyState
            icon={Search}
            title="Start a search"
            description="Enter a run id, task id, dataset name, or pick a resource type above. Exact ids work best for runs and tasks."
          />
        ) : searchQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        ) : searchQuery.isError ? (
          <p className="text-sm text-destructive">{formatApiClientError(searchQuery.error)}</p>
        ) : items.length === 0 ? (
          <MlopsEmptyState
            icon={Search}
            title="No matches"
            description="Try another keyword or switch resource type. Exact ids work best for runs and tasks."
          />
        ) : (
          <div className="divide-y divide-border/80 overflow-hidden rounded-lg border border-border bg-card/80">
            {items.map((result, i) => {
              const at = result.updated_at || result.created_at
              return (
              <Link
                key={`${result.type}-${resultLabel(result)}-${i}`}
                href={normalizeSearchHref(result)}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background/60">
                  <TypeIcon type={result.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm text-sky-400 group-hover:text-sky-300">
                      {resultLabel(result)}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      {result.type}
                    </span>
                  </div>
                  {result.scope_tenant_id ? (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                      {result.scope_tenant_id} / {result.scope_project_id}
                    </p>
                  ) : null}
                </div>
                {result.status ? (
                  <StatusBadge status={statusForItem(result)} label={result.status} size="sm" />
                ) : (
                  <span className="w-16 shrink-0" aria-hidden />
                )}
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {at ? formatRelativeTime(at) : "—"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80 group-hover:text-muted-foreground" aria-hidden />
              </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col p-6">
          <ListTableSkeleton rows={6} />
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  )
}
