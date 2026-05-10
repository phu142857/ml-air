"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { createPipelineVersionApi, listPipelineVersionsApi } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
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

  return (
    <RouteShell
      activeNav="Pipelines"
      title={`Pipeline versions · ${pipelineId}`}
      subtitle="Immutable config snapshots; use diff to compare"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-sm"
          onClick={() => router.push("/pipelines")}
        >
          Back
        </Button>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        >
          DAG
        </Link>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/diff${left && right ? `?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}` : ""}`}
          className="rounded-lg border border-amber-600/50 bg-amber-950/20 px-3 py-1.5 text-sm text-amber-100"
        >
          Open diff
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create version</CardTitle>
          </CardHeader>
          <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">POST creates the next monotonic version; previous rows are not modified.</p>
          <textarea
            className="mb-2 h-40 w-full rounded-xl border border-border bg-background p-2 font-mono text-xs text-foreground"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
          <Button
            type="button"
            disabled={createMut.isPending}
            className="px-4 py-2 text-sm"
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Creating…" : "Create new version"}
          </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compare (pick two, then Open diff)</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <label className="text-muted-foreground">
              Version A
              <SelectDropdown
                value={left}
                onChange={setLeft}
                options={versionPickOptions}
                className="mt-1"
                buttonClassName="rounded-lg border border-border bg-muted px-2 py-1 text-sm"
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
                buttonClassName="rounded-lg border border-border bg-muted px-2 py-1 text-sm"
                aria-label="Version B for diff"
              />
            </label>
          </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All versions</CardTitle>
        </CardHeader>
        <CardContent>
        {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <DataTableShell>
          <DataTable className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">version_id</th>
                <th className="py-2 pr-2">created</th>
                <th className="py-2">config (preview)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.version_id} className="border-t border-border">
                  <td className="py-2 pr-2 align-top font-mono">{v.version}</td>
                  <td className="py-2 pr-2 align-top font-mono text-xs text-muted-foreground">{v.version_id}</td>
                  <td className="py-2 pr-2 align-top text-xs text-muted-foreground">{formatDateTimeCompact(v.created_at)}</td>
                  <td className="py-2 align-top">
                    <pre className="max-h-32 max-w-xl overflow-auto rounded border border-border bg-muted p-2 font-mono text-xs text-foreground">
                      {JSON.stringify(v.config, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {items.length === 0 && !listQuery.isLoading && (
            <p className="py-4 text-sm text-muted-foreground">No versions yet. Create one on the left.</p>
          )}
        </DataTableShell>
        </CardContent>
      </Card>
    </RouteShell>
  );
}
