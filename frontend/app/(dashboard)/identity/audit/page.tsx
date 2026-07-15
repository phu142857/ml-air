"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { listIdentityAudit } from "@/lib/identity-admin-api";

const ACTION_FILTERS = [
  "",
  "auth.login",
  "auth.logout",
  "auth.password_change",
  "identity.user.create",
  "identity.user.update",
  "identity.user.state_change",
  "identity.user.delete",
  "identity.role.assign",
  "identity.role.replace",
  "identity.session.revoke",
  "identity.sa.create",
  "identity.sa.update",
  "identity.sa.token.regenerate",
  "identity.sa.token.revoke",
] as const;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentityAuditPage() {
  const { token } = useAppContext();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  const queryKey = useMemo(() => ["identity-audit", token, q, action], [token, q, action]);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      listIdentityAudit(token, {
        limit: 200,
        q: q.trim() || undefined,
        action: action || undefined,
      }),
    enabled: Boolean(token?.trim()),
  });

  const events = data || [];

  return (
    <SettingsPage loading={isLoading} error={error ? String((error as Error).message) : null}>
      <SettingsPageHeader
        title="Audit logs"
        description="Append-only identity and access events for compliance and incident response."
      />

      <SettingsSection id="logs" title="Event log" description="Filter by action type or free-text search.">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search action, actor, target…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 max-w-sm text-sm"
            aria-label="Search audit logs"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {ACTION_FILTERS.filter(Boolean).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {events.length === 0 && !isLoading ? (
          <SettingsEmptyState
            title="No events found"
            description={q || action ? "Try adjusting your search or filters." : "Identity events will appear here as they occur."}
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Result</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatWhen(e.occurred_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.actor_kind}
                      {e.actor_id ? ` / ${e.actor_id}` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-3">
                      <IdentityStatusBadge state={e.result === "success" ? "active" : "locked"} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-8" asChild>
                        <Link href={`/identity/audit/${e.id}`}>Detail</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
