"use client";

import { useQuery } from "@tanstack/react-query";
import { DetailSection } from "@/components/mlops/layout";
import { listIdentityAudit } from "@/lib/identity-admin-api";
import { useAppContext } from "@/lib/app-context";

export function ConfigAuditPanel() {
  const { token } = useAppContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ["config-audit", token],
    queryFn: () => listIdentityAudit(token, 200, "system_settings.patch"),
    enabled: Boolean(token?.trim()),
  });

  return (
    <DetailSection
      title="Configuration audit"
      description="Platform L4 settings changes (who, when, which keys)."
      accentBorder="amber"
      className="flex min-h-[min(70vh,48rem)] flex-1 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      {isLoading ? <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="px-4 py-3 text-sm text-destructive">{(error as Error).message}</p> : null}
      <div className="scroll-region min-h-0 flex-1 rounded-b-xl border-t border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium">Time</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Actor</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Keys changed</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((e) => {
              const keys = Array.isArray((e.payload?.metadata as { keys?: string[] })?.keys)
                ? (e.payload.metadata as { keys: string[] }).keys.join(", ")
                : JSON.stringify(e.payload || {});
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{e.occurred_at}</td>
                  <td className="px-3 py-2 text-xs">
                    {e.actor_kind}
                    {e.actor_id ? ` / ${e.actor_id}` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{keys}</td>
                  <td className="px-3 py-2 text-xs">{e.result}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && (data || []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No configuration changes recorded yet.</p>
        ) : null}
      </div>
      <p className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        Identity security events (login, PAT, sessions) are in{" "}
        <a href="/admin/audit" className="text-primary hover:underline">
          Administration → Identity audit
        </a>
        .
      </p>
    </DetailSection>
  );
}
