"use client"

import { Suspense, useMemo } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ListTodo, Loader2 } from "lucide-react"
import { fetchTaskResolved } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { ResourcePageHeader } from "@/components/layout/page-chrome"
import { parseTaskScopeHint, taskScopeHintKey } from "@/lib/task-detail-href"
import { formatApiClientError } from "@/lib/utils"
import { isScopePinned } from "@/lib/scope"

function TaskDetailContent() {
  const router = useRouter()
  const params = useParams<{ taskId: string }>()
  const searchParams = useSearchParams()
  const taskId = params.taskId
  const { tenantId, projectId, token } = useAppContext()

  const hint = useMemo(() => parseTaskScopeHint(searchParams), [searchParams])
  const scopeKey = taskScopeHintKey(hint)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: mlairKeys.task.detail(taskId, scopeKey),
    queryFn: () =>
      fetchTaskResolved(tenantId, projectId, taskId, token, {
        tenantId: hint.tenantId,
        projectId: hint.projectId,
        runId: hint.runId,
      }),
    enabled: Boolean(taskId?.trim() && token?.trim()),
  })

  const resolved = data?.resolved_scope
  const scopePinned = isScopePinned(tenantId, projectId)
  const runId = data?.run_id ?? hint.runId

  return (
    <div className="flex h-full flex-col">
      <ResourcePageHeader
        icon={ListTodo}
        accent="violet"
        title={`Task · ${taskId}`}
        subtitle={
          resolved
            ? `${resolved.tenant_id} / ${resolved.project_id}${
                resolved.method === "fan-out" ? " (resolved from aggregate scope)" : ""
              }`
            : "Operational detail — JSON payload, attempts, and worker metadata"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {runId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                asChild
              >
                <Link href={`/runs/${encodeURIComponent(runId)}`}>View run</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => router.push("/tasks")}
            >
              All tasks
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {!scopePinned && resolved?.method === "fan-out" ? (
          <p className="text-sm text-amber-400/90">
            Scope was resolved automatically across projects. For faster loads next time, pin{" "}
            <span className="font-mono text-amber-200">
              {resolved.tenant_id} / {resolved.project_id}
            </span>{" "}
            in the header or use a link with{" "}
            <span className="font-mono text-amber-200/80">?tenant=&amp;project=</span>.
          </p>
        ) : null}

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-200">Task payload</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Dense, debuggable view for incident review without leaving the shell.
          </p>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading task">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Resolving task scope…
              </div>
              <div className="h-4 w-2/3 max-w-md animate-pulse rounded-md bg-zinc-800" />
              <div className="h-4 w-full animate-pulse rounded-md bg-zinc-800" />
              <div className="h-48 animate-pulse rounded-md border border-zinc-800 bg-zinc-950" />
            </div>
          ) : isError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formatApiClientError(error)}
            </div>
          ) : (
            <div className="max-h-[min(70vh,520px)] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default function TaskDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading task…
        </div>
      }
    >
      <TaskDetailContent />
    </Suspense>
  )
}
