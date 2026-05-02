"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchTask } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;
  const { tenantId, projectId, token } = useAppContext();

  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(tenantId, projectId, taskId, token)
  });

  return (
    <RouteShell activeNav="Tasks" title={`Task ${taskId}`} subtitle="Deep-link task detail">
      <div className="mb-2">
        <button
          className="button-secondary"
          onClick={() => router.push("/tasks")}
        >
          Back to Tasks
        </button>
      </div>
      <section className="card p-5">
        <h2 className="mb-3 text-section font-semibold text-foreground">Task Detail</h2>
        <div className="font-mono text-xs text-success h-96 overflow-y-auto whitespace-pre-wrap break-all">
          {isLoading ? "Loading..." : JSON.stringify(data, null, 2)}
        </div>
      </section>
    </RouteShell>
  );
}
