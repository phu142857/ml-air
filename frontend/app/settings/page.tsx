"use client";

import { RouteShell } from "@/components/layout/route-shell";

export default function SettingsPage() {
  return (
    <RouteShell activeNav="Settings" title="Settings" subtitle="Environment and configuration panel">
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Config</h2>
        <pre className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">{`pipeline_id: demo_pipeline
project_id: default_project
tasks:
  - prepare
  - train
  - evaluate`}</pre>
      </section>
    </RouteShell>
  );
}
