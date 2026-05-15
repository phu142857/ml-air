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
import { ResourcePageHeader } from "@/components/layout/page-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { SelectDropdown } from "@/components/ui/select-dropdown";

const defaultConfigJson = `{
  "steps": ["fetch", "train", "evaluate"],
  "params": { "max_epochs": 10 }
}`;

const cardClass = "border-zinc-800 bg-zinc-900/50";

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
    <div className="flex h-full flex-col">
      <ResourcePageHeader
        icon={GitBranch}
        accent="amber"
        title="Pipeline versions"
        subtitle={`${pipelineId} · immutable config snapshots; use diff to compare`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              onClick={() => router.push("/pipelines")}
            >
              All pipelines
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" asChild>
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
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-zinc-200">Create version</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-zinc-500">
                POST creates the next monotonic version; previous rows are not modified.
              </p>
              <textarea
                className="mb-2 h-40 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-200"
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
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-zinc-200">Compare</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm">
                <label className="text-zinc-500">
                  Version A
                  <SelectDropdown
                    value={left}
                    onChange={setLeft}
                    options={versionPickOptions}
                    className="mt-1"
                    buttonClassName="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                    aria-label="Version A for diff"
                  />
                </label>
                <label className="text-zinc-500">
                  Version B
                  <SelectDropdown
                    value={right}
                    onChange={setRight}
                    options={versionPickOptions}
                    className="mt-1"
                    buttonClassName="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                    aria-label="Version B for diff"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-zinc-200">All versions</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
            <DataTableShell>
              <DataTable className="text-left text-sm text-zinc-200">
                <thead className="border-b border-zinc-800 bg-zinc-950/80">
                  <tr>
                    <th className="py-2 pr-2 font-medium text-zinc-500">#</th>
                    <th className="py-2 pr-2 font-medium text-zinc-500">version_id</th>
                    <th className="py-2 pr-2 font-medium text-zinc-500">created</th>
                    <th className="py-2 font-medium text-zinc-500">config (preview)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => (
                    <tr key={v.version_id} className="border-t border-zinc-800">
                      <td className="py-2 pr-2 align-top font-mono">{v.version}</td>
                      <td className="py-2 pr-2 align-top font-mono text-xs text-zinc-500">{v.version_id}</td>
                      <td className="py-2 pr-2 align-top text-xs text-zinc-500">{formatDateTimeCompact(v.created_at)}</td>
                      <td className="py-2 align-top">
                        <pre className="max-h-32 max-w-xl overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
                          {JSON.stringify(v.config, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {items.length === 0 && !listQuery.isLoading ? (
                <p className="py-4 text-sm text-zinc-500">No versions yet. Create one on the left.</p>
              ) : null}
            </DataTableShell>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
