"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { DetailSection } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { getIdentityAuditEvent } from "@/lib/identity-admin-api";

export default function IdentityAuditDetailPage() {
  const params = useParams();
  const eventId = String(params.eventId || "");
  const { token } = useAppContext();

  const { data, isLoading, error } = useQuery({
    queryKey: ["identity-audit-detail", eventId, token],
    queryFn: () => getIdentityAuditEvent(token, eventId),
    enabled: Boolean(token?.trim() && eventId),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Audit event</h2>
        <Link href="/identity/audit" className="text-sm text-muted-foreground hover:underline">
          Back to audit logs
        </Link>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}

      {data ? (
        <DetailSection title={data.action} description={data.id}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Occurred at</dt>
              <dd className="font-mono text-xs">{data.occurred_at}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Result</dt>
              <dd>{data.result}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actor</dt>
              <dd>
                {data.actor_kind}
                {data.actor_id ? ` / ${data.actor_id}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd>
                {data.target_type || "—"}
                {data.target_id ? ` / ${data.target_id}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">IP</dt>
              <dd>{data.ip || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User agent</dt>
              <dd className="break-all text-xs">{data.user_agent || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payload</p>
            <pre className="mt-2 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
              {JSON.stringify(data.payload, null, 2)}
            </pre>
          </div>
        </DetailSection>
      ) : null}
    </div>
  );
}
