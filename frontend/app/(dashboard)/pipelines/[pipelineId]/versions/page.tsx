"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { GitBranch } from "lucide-react";
import { createPipelineVersionApi, listPipelineVersionsApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";
import {
  DetailSection,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINE_DETAIL } from "@/lib/scope-messages";
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import type { PipelineVersionItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";

const defaultConfigJson = `{
  "steps": ["fetch", "train", "evaluate"],
  "params": { "max_epochs": 10 }
}`;

export default function PipelineVersionsPage() {
  const router = useRouter();
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = decodeURIComponent(params.pipelineId);
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qc = useQueryClient();
  const [jsonText, setJsonText] = useState(defaultConfigJson);
  const [err, setErr] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId),
    queryFn: () => listPipelineVersionsApi(tenantId, projectId, pipelineId, token),
    enabled: Boolean(token)
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        throw new Error("Invalid JSON");
      }
      return createPipelineVersionApi(tenantId, projectId, pipelineId, token, config);
    },
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: mlairKeys.pipelines.versions(tenantId, projectId, pipelineId) });
    },
    onError: (e: Error) => setErr(e.message)
  });

  const items = listQuery.data?.items ?? [];
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const versionPickOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...items.map((v) => ({
        value: v.version_id,
        label: `v${v.version} · ${v.version_id.slice(0, 8)}…`
      }))
    ],
    [items]
  );

  const versionColumns: DataTableColumn<PipelineVersionItem>[] = useMemo(
    () => [
      {
        id: "version",
        header: "#",
        cell: (row) => <span className="font-mono text-sm">{row.version}</span>,
      },
      {
        id: "version_id",
        header: "version_id",
        cell: (row) => (
          <span className="font-mono text-xs text-muted-foreground">{row.version_id}</span>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{formatDateTimeCompact(row.created_at)}</span>
        ),
      },
      {
        id: "config",
        header: "Config (preview)",
        cell: (row) => (
          <pre className="max-h-32 max-w-xl overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-xs text-foreground/90">
            {JSON.stringify(row.config, null, 2)}
          </pre>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubpageBreadcrumb
        segments={[
          { label: "Pipelines", href: "/pipelines" },
          { label: pipelineId, href: `/pipelines/${encodeURIComponent(pipelineId)}`, mono: true },
          { label: "Versions", mono: true },
        ]}
      />
      <ResourcePageHeader
        icon={GitBranch}
        accent="amber"
        title="Pipeline versions"
        subtitle="Immutable config snapshots"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border bg-card text-foreground/90 hover:bg-muted"
              onClick={() => router.push("/pipelines")}
            >
              All pipelines
            </Button>
            <Button variant="outline" size="sm" className="border-border bg-card text-foreground/90 hover:bg-muted" asChild>
              <Link href={`/pipelines/${encodeURIComponent(pipelineId)}`}>DAG</Link>
            </Button>
            <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-500" asChild>
              <Link
                href={`/pipelines/${encodeURIComponent(pipelineId)}/diff${
                  left && right ? `?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}` : ""
                }`}
              >
                Open diff
              </Link>
            </Button>
          </div>
        }
      />
      <div className="flex-1 space-y-6 overflow-auto p-6">
        {!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINE_DETAIL} /> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailSection title="Create version" accentBorder="amber">
              <p className="mb-2 text-xs text-muted-foreground">
                POST creates the next monotonic version; previous rows are not modified.
              </p>
              <textarea
                className="mb-2 h-40 w-full rounded-lg border border-border bg-muted/30 p-2 font-mono text-xs text-foreground"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              {err ? <p className="mb-2 text-xs text-red-400">{err}</p> : null}
              <Button
                type="button"
                disabled={createMut.isPending}
                className="bg-amber-600 text-white hover:bg-amber-500"
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? "Creating…" : "Create new version"}
              </Button>
          </DetailSection>
          <DetailSection title="Compare" accentBorder="amber">
              <div className="flex flex-col gap-3 text-sm">
                <label className="text-muted-foreground">
                  Version A
                  <SelectDropdown
                    value={left}
                    onChange={setLeft}
                    options={versionPickOptions}
                    className="mt-1"
                    buttonClassName="rounded-lg border border-border bg-muted/30 px-2 py-1 text-sm text-foreground"
                    aria-label="Version A for diff"
                  />
                </label>
                <label className="text-muted-foreground">
                  Version B
                  <SelectDropdown
                    value={right}
                    onChange={setRight}
                    options={versionPickOptions}
                    className="mt-1"
                    buttonClassName="rounded-lg border border-border bg-muted/30 px-2 py-1 text-sm text-foreground"
                    aria-label="Version B for diff"
                  />
                </label>
              </div>
          </DetailSection>
        </div>

        <DetailSection title="All versions" accentBorder="amber">
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <MlopsEmptyState
                icon={GitBranch}
                title="No versions yet"
                description="Create a new immutable config snapshot using the form on the left."
              />
            ) : (
              <DataTable
                columns={versionColumns}
                data={items}
                keyExtractor={(row) => row.version_id}
                emptyMessage="No versions yet."
              />
            )}
        </DetailSection>
      </div>
    </div>
  );
}
