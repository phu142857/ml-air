"use client";

import { useState } from "react";
import Link from "next/link";
import { Box, ChevronDown, Database, Play } from "lucide-react";

import { useLifecycleProjection } from "@/hooks/use-lifecycle-projection";
import { formatVersionLabel } from "@/lib/version-label";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Box;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function LifecycleProjectionPanel({ className }: { className?: string }) {
  const { data, isLoading, isError } = useLifecycleProjection();
  const [open, setOpen] = useState(false);

  if (isError || (!isLoading && !data)) return null;

  const summary = data?.summary;
  const models = data?.models ?? [];
  const datasets = data?.datasets ?? [];

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left pressable"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Project snapshot</span>
          {summary ? (
            <>
              {" · "}
              {summary.model_count} models · {summary.dataset_count} datasets · {summary.active_runs}{" "}
              active runs
            </>
          ) : isLoading ? (
            " · Loading…"
          ) : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {isLoading || !data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-md border border-border bg-muted/40" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Models" value={data.summary.model_count} icon={Box} />
                <StatCard label="Datasets" value={data.summary.dataset_count} icon={Database} />
                <StatCard label="Active runs" value={data.summary.active_runs} icon={Play} />
                <StatCard label="Runs (7d)" value={data.summary.runs_last_7d} icon={Play} />
              </div>

              {(models.length > 0 || datasets.length > 0) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {models.length > 0 ? (
                    <div className="rounded-md border border-border bg-background/60 p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Models
                      </h3>
                      <ul className="space-y-1.5">
                        {models.slice(0, 5).map((m) => (
                          <li key={m.model_id} className="flex items-center justify-between gap-2 text-sm">
                            <Link
                              href={`/models/${encodeURIComponent(m.model_id)}`}
                              className="truncate font-medium text-foreground hover:underline"
                            >
                              {m.name}
                            </Link>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {m.latest_version != null ? formatVersionLabel(m.latest_version) : "—"}
                              {m.stage ? ` · ${m.stage}` : ""}
                              {m.latest_eval_status ? ` · eval ${m.latest_eval_status}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {datasets.length > 0 ? (
                    <div className="rounded-md border border-border bg-background/60 p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Datasets
                      </h3>
                      <ul className="space-y-1.5">
                        {datasets.slice(0, 5).map((d) => (
                          <li key={d.dataset_id} className="flex items-center justify-between gap-2 text-sm">
                            <Link
                              href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                              className="truncate font-medium text-foreground hover:underline"
                            >
                              {d.name}
                            </Link>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {d.readiness_status || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
