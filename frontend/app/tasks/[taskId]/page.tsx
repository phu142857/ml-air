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
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          onClick={() => router.push("/tasks")}
        >
          Back to Tasks
        </button>
      </div>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Task Detail</h2>
        <pre className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {isLoading ? "Loading..." : JSON.stringify(data, null, 2)}
        </pre>
      </section>
    </RouteShell>
  );
}
