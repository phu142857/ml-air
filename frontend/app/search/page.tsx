"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { searchApi } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

function SearchPageInner() {
  const { tenantId, projectId, token } = useAppContext();
  const sp = useSearchParams();
  const q = sp.get("q") || "";
  const type = (sp.get("type") as "all" | "run" | "task" | "dataset") || "all";
  const query = useQuery({
    queryKey: ["search", q, type, tenantId, projectId],
    queryFn: () => searchApi(tenantId, projectId, token, q, type),
    enabled: Boolean(q && token)
  });
  return (
    <RouteShell activeNav="Dashboard" title="Search" subtitle={q || "Enter a query in the top bar"}>
      <div className="space-y-2">
        {query.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {query.error && <p className="text-sm text-red-400">Error</p>}
        {(query.data?.items ?? []).map((it, i) => (
          <Link
            key={`${it.type}-${i}`}
            href={it.href}
            className="block rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm hover:border-slate-500"
          >
            <span className="text-slate-500">[{it.type}]</span> {it.run_id || it.task_id || it.name || "—"}{" "}
            {it.status && <span className="text-slate-400">· {it.status}</span>}
            {it.error_message && <div className="text-xs text-red-300">{it.error_message}</div>}
          </Link>
        ))}
        {q && !query.isLoading && (query.data?.items?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500">No results</p>
        )}
      </div>
    </RouteShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
