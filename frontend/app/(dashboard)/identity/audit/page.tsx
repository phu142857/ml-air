"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { DetailSection } from "@/components/mlops/layout";
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

  return (
    <DetailSection title="Audit logs" description="Append-only identity and access events">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search action, actor, target…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 max-w-sm text-sm"
        />
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          {ACTION_FILTERS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Result</th>
              <th className="px-3 py-2 text-left" />
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
                <td className="px-3 py-2 text-right">
                  <Link href={`/identity/audit/${e.id}`} className="text-primary hover:underline">
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailSection>
  );
}
