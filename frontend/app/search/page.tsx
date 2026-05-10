"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { searchApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SearchPageInner() {
  const { tenantId, projectId, token } = useAppContext();
  const sp = useSearchParams();
  const q = sp.get("q") || "";
  const type = (sp.get("type") as "all" | "run" | "task" | "dataset") || "all";
  const query = useQuery({
    queryKey: mlairKeys.search(tenantId, projectId, q, type),
    queryFn: () => searchApi(tenantId, projectId, token, q, type),
    enabled: Boolean(q && token)
  });
  return (
    <RouteShell activeNav="None" title="Search" subtitle={q || "Enter a query in the top bar"}>
      <Card>
        <CardHeader>
          <CardTitle>Search Results</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="space-y-2">
          {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {query.error && <p className="text-sm text-red-400">Error</p>}
          {(query.data?.items ?? []).map((it, i) => (
            <Link
              key={`${it.type}-${i}`}
              href={it.href}
              className="interactive-item block rounded-xl border border-border bg-muted px-3 py-2 text-sm transition-colors"
            >
              <span className="text-muted-foreground">[{it.type}]</span> {it.run_id || it.task_id || it.name || "—"}{" "}
              {it.status && <span className="text-muted-foreground">· {it.status}</span>}
              {it.error_message && <div className="text-xs text-red-300">{it.error_message}</div>}
            </Link>
          ))}
          {q && !query.isLoading && (query.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No results</p>
          )}
        </div>
        </CardContent>
      </Card>
    </RouteShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
