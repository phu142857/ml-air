"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { GitBranch } from "lucide-react";
import { usePipelineVersionsList } from "@/hooks/use-pipeline-versions-list";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";
import {
  DetailSection,
  MlopsEmptyState,
  PageScrollBody,
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
import { PipelineConfigEditorDialog } from "@/components/mlops/pipeline-config-editor-dialog";
import { parsePipelineInputs } from "@/lib/pipeline-config";

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
  const [jsonText, setJsonText] = useState(defaultConfigJson);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [createEditorOpen, setCreateEditorOpen] = useState(false);

  const listQuery = usePipelineVersionsList(pipelineId, Boolean(token));
  const items = listQuery.items;
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const versionPickOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...items.map((v) => ({
        value: v.version_id,
        label: `${formatVersionLabel(v.version)} · ${v.version_id.slice(0, 8)}…`,
      })),
    ],
    [items],
  );

  const versionColumns: DataTableColumn<PipelineVersionItem>[] = useMemo(
    () => [
      {
        id: "version",
        header: "#",
        width: 96,
        canHide: false,
        getSortValue: (row) => row.version,
        cell: (row) => <span className="font-mono text-sm">{row.version}</span>,
      },
      {
        id: "version_id",
        header: "version_id",
        width: 280,
        getSearchValue: (row) => row.version_id,
        getSortValue: (row) => row.version_id,
        cell: (row) => (
          <span className="font-mono text-xs text-muted-foreground">{row.version_id}</span>
        ),
      },
      {
        id: "created",
        header: "Created",
        width: 180,
        getSortValue: (row) => row.created_at,
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{formatDateTimeCompact(row.created_at)}</span>
        ),
      },
      {
        id: "inputs",
        header: "inputs[]",
        width: 320,
        wrap: true,
        getSearchValue: (row) =>
          parsePipelineInputs(row.config as Record<string, unknown>)
            .map((i) => `${i.dataset} ${i.required_size}`)
            .join(" "),
        cell: (row) => {
          const inputs = parsePipelineInputs(row.config as Record<string, unknown>);
          if (!inputs.length) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="font-mono text-[10px] text-foreground/90">
              {inputs.map((i) => `${i.dataset}≥${i.required_size}`).join(", ")}
            </span>
          );
        },
      },
      {
        id: "config",
        header: "Config",
        width: 110,
        canHide: false,
        cell: (row) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-border text-xs"
            onClick={() => {
              setPreviewVersionId(row.version_id);
              setPreviewOpen(true);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
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
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINE_DETAIL} /> : null}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailSection title="Create version" accentBorder="amber">
            <p className="mb-2 text-xs text-muted-foreground">
              POST creates the next monotonic version; previous rows are not modified. Use the full-screen editor to
              review <code className="font-mono">inputs[]</code> and task config before publishing.
            </p>
            <textarea
              className="mb-2 h-28 w-full inset-surface p-2 font-mono text-xs text-foreground"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setCreateEditorOpen(true)}
              >
                Open full editor
              </Button>
            </div>
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
                  buttonClassName="inset-surface px-2 py-1 text-sm text-foreground"
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
                  buttonClassName="inset-surface px-2 py-1 text-sm text-foreground"
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
              description="Publish the first config snapshot using the create editor."
            />
          ) : (
            <>
              <DataTable
                tableId={`pipeline-versions:${pipelineId}`}
                title="All versions"
                description="Sortable, searchable snapshot history with saved operator views."
                columns={versionColumns}
                data={items}
                keyExtractor={(row) => row.version_id}
                emptyMessage="No versions yet."
                loading={listQuery.isLoading}
              />
              {listQuery.hasNextPage ? (
                <div className="flex justify-center border-t border-border/60 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={listQuery.isFetchingNextPage}
                    onClick={() => void listQuery.fetchNextPage()}
                  >
                    {listQuery.isFetchingNextPage ? "Loading…" : "Load more versions"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </DetailSection>
      </PageScrollBody>

      <PipelineConfigEditorDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        tenantId={tenantId}
        projectId={projectId}
        pipelineId={pipelineId}
        token={token}
        versionId={previewVersionId}
      />

      <PipelineConfigEditorDialog
        open={createEditorOpen}
        onOpenChange={setCreateEditorOpen}
        tenantId={tenantId}
        projectId={projectId}
        pipelineId={pipelineId}
        token={token}
        allowCreateVersion
        seedJson={jsonText}
      />
    </div>
  );
}
