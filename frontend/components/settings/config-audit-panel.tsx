"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { listIdentityAudit } from "@/lib/identity-admin-api";
import { useAppContext } from "@/lib/app-context";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ConfigAuditPanel() {
  const { token } = useAppContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ["config-audit", token],
    queryFn: () => listIdentityAudit(token, { limit: 200, action: "system_settings.patch" }),
    enabled: Boolean(token?.trim()),
  });

  const events = data || [];

  return (
    <SettingsPage loading={isLoading} error={error ? String((error as Error).message) : null}>
      <SettingsPageHeader
        title="Configuration audit"
        description="Platform L4 settings changes — who changed what and when."
      />

      <SettingsSection id="audit-log" title="Change log" description="Filtered to system_settings.patch events.">
        {events.length === 0 && !isLoading ? (
          <SettingsEmptyState
            title="No configuration changes"
            description="Platform settings changes will appear here as they occur."
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Keys changed</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const keys = Array.isArray((e.payload?.metadata as { keys?: string[] })?.keys)
                    ? (e.payload.metadata as { keys: string[] }).keys.join(", ")
                    : JSON.stringify(e.payload || {});
                  return (
                    <tr key={e.id} className="border-t border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatWhen(e.occurred_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.actor_kind}
                        {e.actor_id ? ` / ${e.actor_id}` : ""}
                      </td>
                      <td className="max-w-md truncate px-4 py-3 font-mono text-xs">{keys}</td>
                      <td className="px-4 py-3">
                        <IdentityStatusBadge state={e.result === "success" ? "active" : "locked"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Identity security events (login, PAT, sessions) are in{" "}
          <Link href="/identity/audit" className="text-primary hover:underline">
            Identity audit logs
          </Link>
          .
        </p>
      </SettingsSection>
    </SettingsPage>
  );
}
