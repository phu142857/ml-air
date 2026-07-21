"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, Bot, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdentityStatusBadge, SettingsPage, SettingsPageHeader, SettingsSection } from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { fetchIdentityDashboard } from "@/lib/identity-admin-api";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentityDashboardPage() {
  const { token } = useAppContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ["identity-dashboard", token],
    queryFn: () => fetchIdentityDashboard(token),
    enabled: Boolean(token?.trim()),
  });

  return (
    <SettingsPage loading={isLoading} error={error ? String((error as Error).message) : null}>
      <SettingsPageHeader
        title="Identity overview"
        description="Platform-wide identity posture — users, service accounts, and active sessions."
        secondaryActions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/identity/audit">View audit logs</Link>
          </Button>
        }
      />

      {data ? (
        <>
          <SettingsSection id="summary" title="Summary" description="Current identity inventory.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total users" value={data.total_users} icon={Users} />
              <StatCard label="Active users" value={data.active_users} icon={UserCheck} />
              <StatCard label="Service accounts" value={data.service_accounts} icon={Bot} />
              <StatCard label="Active sessions" value={data.active_sessions} icon={Monitor} />
            </div>
          </SettingsSection>

          <SettingsSection
            id="recent-events"
            title="Recent identity events"
            description="Latest security and access events across the platform."
            headerActions={
              <Button variant="ghost" size="sm" className="h-8" asChild>
                <Link href="/identity/audit">View all</Link>
              </Button>
            }
          >
            {(data.recent_events || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent events.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Time</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Actor</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recent_events || []).map((event) => (
                      <tr key={event.id} className="border-t border-border/60 hover:bg-muted/30">
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
        </>
      ) : null}
    </SettingsPage>
  );
}
