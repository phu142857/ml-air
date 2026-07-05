"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRightLeft, Bell, Clock, ShieldCheck } from "lucide-react";

import { SelectDropdown } from "@/components/ui/select-dropdown";
import {
  fetchModelProvenance,
  fetchSemanticEventOutbox,
  type ModelVersionItem,
} from "@/lib/api";
import { useAuditTimelineInfinite } from "@/hooks/use-audit-timeline-infinite";
import { mlairKeys } from "@/lib/query-keys";
import { formatDateTimeCompact } from "@/lib/utils";

type Scope = {
  tenantId: string;
  projectId: string;
  modelId: string;
  token: string;
};

function governanceEventLabel(kind: string, payload: Record<string, unknown>): string {
  if (kind === "model.version.stage_updated") {
    return `Stage → ${String(payload.stage || "—")} (v${payload.version ?? "?"})`;
  }
  if (kind === "model.version.approval_updated") {
    return `Approval ${String(payload.approval_status || "—")} (v${payload.version ?? "?"})`;
  }
  if (kind === "model.version.created") {
    return `Version created v${payload.version ?? "?"} in ${String(payload.stage || "staging")}`;
  }
  return kind.replace(/\./g, " · ");
}

export function ModelStageTimeline({
  tenantId,
  projectId,
  modelId,
  token,
  versions,
}: Scope & { versions: ModelVersionItem[] }) {
  const { events, isLoading } = useAuditTimelineInfinite(
    { resourceType: "model", resourceId: modelId },
    Boolean(token?.trim()),
    30,
  );

  const stageEvents = useMemo(() => {
    const fromAudit = events
      .filter((e) => {
        const title = e.title || "";
        return (
          title.includes("model.version.stage_updated") ||
          title.includes("model.version.created")
        );
      })
      .map((e) => {
        const p = e.metadata || {};
        const kind = e.title.split(" · ")[0] || "";
        return {
          id: e.id,
          at: e.timestamp,
          label: governanceEventLabel(kind, p),
          source: "audit" as const,
        };
      });

    const fromVersions = versions.flatMap((v) => {
      const items: Array<{ id: string; at: string; label: string; source: "version" }> = [
        {
          id: `created-${v.version_id}`,
          at: v.created_at,
          label: `Registered v${v.version} (${v.stage})`,
          source: "version",
        },
      ];
      if (v.stage_updated_at && v.stage_updated_at !== v.created_at) {
        items.push({
          id: `stage-${v.version_id}`,
          at: v.stage_updated_at,
          label: `Stage → ${v.stage} (v${v.version})`,
          source: "version",
        });
      }
      return items;
    });

    const merged = [...fromAudit, ...fromVersions];
    const seen = new Set<string>();
    return merged
      .filter((row) => {
        const key = `${row.at}:${row.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 12);
  }, [events, versions]);

  if (!stageEvents.length && !isLoading) {
    return <p className="text-xs text-muted-foreground">No stage transitions recorded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {isLoading ? <li className="text-xs text-muted-foreground">Loading timeline…</li> : null}
      {stageEvents.map((row) => (
        <li key={row.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{row.label}</p>
            <p className="text-muted-foreground">{formatDateTimeCompact(row.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ModelApprovalHistory({
  tenantId,
  projectId,
  modelId,
  token,
  versions,
}: Scope & { versions: ModelVersionItem[] }) {
  const { events } = useAuditTimelineInfinite(
    { resourceType: "model", resourceId: modelId, kind: "model.version.approval_updated" },
    Boolean(token?.trim()),
    30,
  );

  const rows = useMemo(() => {
    const fromVersions = versions
      .filter((v) => v.approval_updated_at && v.approval_status)
      .map((v) => ({
        id: `ver-${v.version_id}`,
        at: v.approval_updated_at!,
        version: v.version,
        status: String(v.approval_status),
        reason: v.approval_reason || null,
        actor: "registry",
      }));

    const fromAudit = events.map((e) => {
      const p = e.metadata || {};
      return {
        id: e.id,
        at: e.timestamp,
        version: Number(p.version || 0),
        status: String(p.approval_status || "—"),
        reason: typeof p.approval_reason === "string" ? p.approval_reason : null,
        actor: e.actor.name,
      };
    });

    const merged = [...fromAudit, ...fromVersions];
    const seen = new Set<string>();
    return merged
      .filter((r) => {
        const key = `${r.version}:${r.at}:${r.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 20);
  }, [events, versions]);

  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No approval actions yet.</p>;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="font-mono">v{r.version}</span>
            <span className="rounded-full border border-border px-1.5 py-0.5 font-medium capitalize">{r.status}</span>
          </div>
          <div className="text-right text-muted-foreground">
            <div>{r.actor}</div>
            <div>{formatDateTimeCompact(r.at)}</div>
            {r.reason ? <div className="max-w-xs truncate italic" title={r.reason}>{r.reason}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

type CompareField = { key: string; left: string; right: string; changed: boolean };

export function ModelVersionComparePanel({
  tenantId,
  projectId,
  modelId,
  token,
  versions,
}: Scope & { versions: ModelVersionItem[] }) {
  const [leftVer, setLeftVer] = useState<number | "">("");
  const [rightVer, setRightVer] = useState<number | "">("");

  const options = versions.map((v) => ({
    value: String(v.version),
    label: `v${v.version} · ${v.stage}`,
  }));

  const left = versions.find((v) => v.version === leftVer) ?? null;
  const right = versions.find((v) => v.version === rightVer) ?? null;

  const leftProv = useQuery({
    queryKey: mlairKeys.models.provenance(tenantId, projectId, modelId, leftVer === "" ? null : leftVer),
    queryFn: () =>
      fetchModelProvenance(tenantId, projectId, modelId, token, Number(leftVer)),
    enabled: Boolean(token && leftVer),
  });
  const rightProv = useQuery({
    queryKey: mlairKeys.models.provenance(tenantId, projectId, modelId, rightVer === "" ? null : rightVer),
    queryFn: () =>
      fetchModelProvenance(tenantId, projectId, modelId, token, Number(rightVer)),
    enabled: Boolean(token && rightVer),
  });

  const fields: CompareField[] = useMemo(() => {
    if (!left || !right) return [];
    const pairs: Array<[string, string, string]> = [
      ["Stage", left.stage, right.stage],
      ["Approval", String(left.approval_status || "—"), String(right.approval_status || "—")],
      ["Artifact URI", left.artifact_uri || "—", right.artifact_uri || "—"],
      ["Run", left.run_id || "—", right.run_id || "—"],
      [
        "Dataset version",
        leftProv.data?.dataset_version?.version || "—",
        rightProv.data?.dataset_version?.version || "—",
      ],
      ["Created", formatDateTimeCompact(left.created_at), formatDateTimeCompact(right.created_at)],
    ];
    return pairs.map(([key, l, r]) => ({ key, left: l, right: r, changed: l !== r }));
  }, [left, right, leftProv.data, rightProv.data]);

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold text-foreground">Compare versions</span>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Left
          <SelectDropdown
            value={leftVer === "" ? "" : String(leftVer)}
            onChange={(v) => setLeftVer(v ? Number.parseInt(v, 10) : "")}
            options={[{ value: "", label: "Pick…" }, ...options]}
            className="mt-1 min-w-[10rem]"
            buttonClassName="panel-surface px-2 py-1.5 text-xs"
            aria-label="Left version"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Right
          <SelectDropdown
            value={rightVer === "" ? "" : String(rightVer)}
            onChange={(v) => setRightVer(v ? Number.parseInt(v, 10) : "")}
            options={[{ value: "", label: "Pick…" }, ...options]}
            className="mt-1 min-w-[10rem]"
            buttonClassName="panel-surface px-2 py-1.5 text-xs"
            aria-label="Right version"
          />
        </label>
      </div>
      {left && right ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[28rem] text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">v{left.version}</th>
                <th className="px-3 py-2 font-medium">v{right.version}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr
                  key={f.key}
                  className={f.changed ? "bg-[color:var(--status-pending-bg)]/40" : "border-t border-border/60"}
                >
                  <td className="px-3 py-2 font-medium text-foreground">{f.key}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-muted-foreground" title={f.left}>
                    {f.left}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-muted-foreground" title={f.right}>
                    {f.right}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Select two versions to highlight differences.</p>
      )}
    </div>
  );
}

export function ModelPromoteWebhookLog({ tenantId, projectId, modelId, token }: Scope) {
  const outboxQuery = useQuery({
    queryKey: mlairKeys.semantic.outbox(tenantId, projectId, modelId),
    queryFn: () =>
      fetchSemanticEventOutbox(tenantId, projectId, token, {
        limit: 50,
        eventType: "model.promoted",
      }),
    enabled: Boolean(token?.trim()),
  });

  const rows = useMemo(() => {
    const items = outboxQuery.data?.items ?? [];
    return items
      .filter((row) => {
        const env = row.envelope || {};
        const p = (env.payload as Record<string, unknown>) || {};
        const mid = String(p.model_id || env.model_id || env.resource_id || "");
        return mid === modelId;
      })
      .map((row) => {
        const env = row.envelope || {};
        const p = (env.payload as Record<string, unknown>) || {};
        const at = row.created_at;
        const atStr =
          typeof at === "string"
            ? at
            : at && typeof at === "object" && "toISOString" in (at as object)
              ? String((at as { toISOString: () => string }).toISOString())
              : "";
        return {
          id: row.outbox_id,
          at: atStr || String(p.updated_at || ""),
          delivered: Boolean(row.redis_delivered_at),
          version: p.version != null ? Number(p.version) : null,
          stage: p.stage != null ? String(p.stage) : null,
        };
      })
      .slice(0, 10);
  }, [outboxQuery.data, modelId]);

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold text-foreground">Promote webhook delivery</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Semantic <code className="font-mono">model.promoted</code> events from the durable outbox (
        <code className="font-mono">ML_AIR_EVENT_OUTBOX=1</code>). Legacy{" "}
        <code className="font-mono">ML_AIR_PROMOTE_WEBHOOK_URL</code> attempts are API logs only.
      </p>
      {outboxQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading delivery log…</p>
      ) : rows.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-3 py-2">
              <span className="font-mono">
                v{r.version ?? "?"} → {r.stage || "—"}
              </span>
              <span className={r.delivered ? "text-[color:var(--status-success-fg)]" : "text-[color:var(--status-pending-fg)]"}>
                {r.delivered ? "delivered" : "pending"}
              </span>
              <span className="text-muted-foreground">{r.at ? formatDateTimeCompact(String(r.at)) : "—"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No outbox rows for this model. Enable the outbox or check{" "}
          <Link href="/lifecycle" className="text-primary underline">
            Lifecycle events
          </Link>
          .
        </p>
      )}
    </div>
  );
}
