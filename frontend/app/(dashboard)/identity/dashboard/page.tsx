"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, Bot, Monitor } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
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
    <div className="panel-surface rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function IdentityDashboardPage() {
  const { token } = useAppContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ["identity-dashboard", token],
    queryFn: () => fetchIdentityDashboard(token),
    enabled: Boolean(token?.trim()),
  });

  return (
    <div className="space-y-6">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Users" value={data.total_users} icon={Users} />
            <StatCard label="Active Users" value={data.active_users} icon={UserCheck} />
            <StatCard label="Service Accounts" value={data.service_accounts} icon={Bot} />
            <StatCard label="Active Sessions" value={data.active_sessions} icon={Monitor} />
          </div>

          <DetailSection title="Recent identity events" description="Latest security and access events">
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Actor</th>
                    <th className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recent_events || []).map((event) => (
                    <tr key={event.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{event.occurred_at}</td>
                      <td className="px-3 py-2">
                        <Link href={`/identity/audit/${event.id}`} className="text-primary hover:underline">
                          {event.action}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {event.actor_kind}
                        {event.actor_id ? ` / ${event.actor_id}` : ""}
                      </td>
                      <td className="px-3 py-2">{event.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <Link href="/identity/audit" className="text-sm text-primary hover:underline">
                View all audit logs →
              </Link>
            </div>
          </DetailSection>
        </>
      ) : null}
    </div>
  );
}
