"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { fetchIdentityDashboard, listIdentityAudit } from "@/lib/identity-admin-api";

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
  "system_settings.patch",
] as const;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="px-0 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export default function IdentityAuditLogsPage() {
  const { token } = useAppContext();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["identity-dashboard", token],
    queryFn: () => fetchIdentityDashboard(token),
    enabled: Boolean(token?.trim()),
  });

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
    <SettingsPage
      loading={isLoading || dashboardQuery.isLoading}
      error={error ? String((error as Error).message) : dashboardQuery.error ? String((dashboardQuery.error as Error).message) : null}
    >
      <SettingsPageHeader
        title="Audit Logs"
      />

      {dashboardQuery.data ? (
        <SettingsSection id="dashboard" title="Dashboard" description="Identity footprint at a glance.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total users" value={dashboardQuery.data.total_users} />
            <StatCard label="Active users" value={dashboardQuery.data.active_users} />
            <StatCard label="Service accounts" value={dashboardQuery.data.service_accounts} />
            <StatCard label="Active sessions" value={dashboardQuery.data.active_sessions} />
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection id="logs" title="Event log">
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
          />
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead className="border-b border-border/40 bg-background">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border/20 hover:bg-accent/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatWhen(event.occurred_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/identity/audit/${event.id}`} className="font-medium text-primary hover:underline">
                        {event.action}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {event.actor_kind}
                      {event.actor_id ? ` / ${event.actor_id}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <IdentityStatusBadge state={event.result === "success" ? "active" : "locked"} />
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
