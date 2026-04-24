"use client";

import { RouteShell } from "@/components/layout/route-shell";

export default function TasksPage() {
  return (
    <RouteShell activeNav="Tasks" title="Tasks" subtitle="Task-level logs, metrics and artifacts">
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Task Detail</h2>
        <p className="text-sm text-slate-400">
          Use <code>/runs</code> to select a run and inspect tasks with logs/replay actions.
          Next step: wire direct route <code>/tasks/[taskId]</code> with real task detail endpoint.
        </p>
      </section>
    </RouteShell>
  );
}
