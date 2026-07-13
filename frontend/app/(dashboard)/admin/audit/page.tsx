"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { PageScrollBody, ResourcePageHeader } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { listIdentityAudit } from "@/lib/identity-admin-api";

export default function AdminAuditPage() {
  const { token } = useAppContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-audit", token],
    queryFn: () => listIdentityAudit(token, 200),
    enabled: Boolean(token?.trim()),
  });

  return (
    <PageScrollBody
      variant="workspace"
      header={
        <ResourcePageHeader
          icon={ScrollText}
          accent="zinc"
          title="Identity audit"
          subtitle="Append-only security events"
        />
      }
    >
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      <div className="scroll-region min-h-0 flex-1 rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Result</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{e.occurred_at}</td>
                <td className="px-3 py-2">
                  {e.actor_kind}
                  {e.actor_id ? ` / ${e.actor_id}` : ""}
                </td>
                <td className="px-3 py-2">{e.action}</td>
                <td className="px-3 py-2">{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageScrollBody>
  );
}
