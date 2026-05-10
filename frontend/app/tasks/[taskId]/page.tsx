"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchTask } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { Button } from "@/components/ui/button";

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;
  const { tenantId, projectId, token } = useAppContext();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: mlairKeys.task.detail(taskId),
    queryFn: () => fetchTask(tenantId, projectId, taskId, token)
  });

  return (
    <RouteShell
      activeNav="Tasks"
      title={`Task ${taskId}`}
      subtitle="Operational detail — JSON payload, attempts, and worker metadata (observability surface)"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="rounded-md" onClick={() => router.push("/tasks")}>
          Back to tasks
        </Button>
      </div>
      <section className="rounded-lg border border-obs-border bg-obs-surface p-4">
        <h2 className="mb-2 text-section font-semibold text-foreground">Task payload</h2>
        <p className="mb-3 text-caption text-muted-foreground">
          Dense, debuggable view (Sentry-style) for incident review without leaving the Supabase shell.
        </p>
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading task">
            <div className="h-4 w-2/3 max-w-md animate-pulse rounded-md bg-obs-muted" />
            <div className="h-4 w-full animate-pulse rounded-md bg-obs-muted" />
            <div className="h-4 w-11/12 max-w-lg animate-pulse rounded-md bg-obs-muted" />
            <div className="h-48 animate-pulse rounded-md border border-obs-border bg-obs-log" />
          </div>
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
            {String((error as Error)?.message || error || "Failed to load task")}
          </div>
        ) : (
          <div className="max-h-[min(70vh,520px)] overflow-auto rounded-md border border-obs-border bg-obs-log p-3 font-mono text-xs text-foreground">
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre>
          </div>
        )}
      </section>
    </RouteShell>
  );
}
