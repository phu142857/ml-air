"use client"

import { Suspense, useMemo } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ListTodo, Loader2 } from "lucide-react"
import { fetchTaskResolved, normalizeProjectId } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import {
  MetadataGrid,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout"
import { JsonPayloadPanel } from "@/components/mlops/json-payload-panel"
import { StatusBadge } from "@/components/mlops/status-badge"
import { parseTaskScopeHint, taskScopeHintKey } from "@/lib/task-detail-href"
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils"
import { isScopePinned } from "@/lib/scope"
import { statusToMlopsBadge } from "@/lib/status-style"

function taskPayloadRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}
  return data as Record<string, unknown>
}

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
  const payload = taskPayloadRecord(data)

  if (!isLoading && !isError && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SubpageBreadcrumb
          segments={[
            { label: "Tasks", href: "/tasks" },
            { label: taskId, mono: true },
          ]}
        />
        <ResourcePageHeader accent="violet" icon={ListTodo} title="Task not found" subtitle={taskId} />
        <div className="flex flex-1 items-center justify-center p-6">
          <MlopsEmptyState
            icon={ListTodo}
            title="Task not found"
            description="This task could not be resolved. Return to the list or pin tenant/project scope."
            action={
              <Button asChild size="sm" variant="outline" className="border-border bg-card">
                <Link href="/tasks">Back to tasks</Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubpageBreadcrumb
        segments={[
          { label: "Tasks", href: "/tasks" },
          { label: taskId, mono: true },
        ]}
      />
      <ResourcePageHeader
        icon={ListTodo}
        accent="violet"
        title={`Task · ${taskId}`}
        subtitle={
          isError
            ? "Could not load task"
            : resolved
              ? scopePinned
                ? resolved.method === "fan-out"
                  ? "Resolved via cross-project fan-out"
                  : undefined
                : `${resolved.tenant_id} / ${resolved.project_id}${resolved.method === "fan-out" ? " · fan-out" : ""}`
              : isLoading
                ? "Loading task…"
                : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {runId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
                asChild
              >
                <Link href={`/runs/${encodeURIComponent(runId)}`}>View run</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
              onClick={() => router.push("/tasks")}
            >
              All tasks
            </Button>
          </div>
        }
      />
      <div className="flex-1 space-y-6 overflow-auto p-6">
        {!scopePinned ? (
          <ScopePinnedInline message="Task resolution may span multiple workspaces." />
        ) : null}
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

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card/80 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Resolving task scope…
            </div>
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-border bg-card/80 p-4">
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formatApiClientError(error)}
            </div>
          </div>
        ) : data ? (
          <>
            <div className="rounded-lg border border-border bg-card/80 p-4">
              <h2 className="mb-4 text-sm font-medium text-foreground/90">Summary</h2>
              <MetadataGrid
                columns={2}
                items={[
                  { label: "Task ID", value: data.task_id, mono: true },
                  {
                    label: "Status",
                    value: <StatusBadge status={statusToMlopsBadge(data.status)} label={data.status} size="sm" />,
                  },
                  { label: "Attempt", value: String(data.attempt ?? "—") },
                  {
                    label: "Run",
                    value: runId ? (
                      <Link href={`/runs/${encodeURIComponent(runId)}`} className="font-mono text-xs text-sky-400 hover:text-sky-300">
                        {runId}
                      </Link>
                    ) : (
                      "—"
                    ),
                    mono: Boolean(runId),
                  },
                  {
                    label: "Created",
                    value: data.created_at ? formatDateTimeCompact(data.created_at) : "—",
                    mono: true,
                  },
                  {
                    label: "Updated",
                    value: data.updated_at ? formatDateTimeCompact(data.updated_at) : "—",
                    mono: true,
                  },
                  ...(scopePinned &&
                  resolved &&
                  String(resolved.tenant_id || "").trim() === String(tenantId || "").trim() &&
                  normalizeProjectId(String(resolved.project_id || "")) === normalizeProjectId(String(projectId || ""))
                    ? []
                    : [
                        {
                          label: "Scope",
                          value: resolved ? `${resolved.tenant_id} / ${resolved.project_id}` : "—",
                          mono: true,
                        },
                      ]),
                ]}
              />
            </div>
            <JsonPayloadPanel title="Task payload" data={payload} className="border-border bg-card/80" />
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function TaskDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading task…
        </div>
      }
    >
      <TaskDetailContent />
    </Suspense>
  )
}
