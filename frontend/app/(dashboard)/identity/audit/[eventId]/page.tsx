"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import {
  IdentityStatusBadge,
  MetadataList,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { getIdentityAuditEvent } from "@/lib/identity-admin-api";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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
    <SettingsPage loading={isLoading} error={error ? String((error as Error).message) : null}>
      <SettingsPageHeader
        title={data?.action || "Audit event"}
        description="Full audit event payload and actor context."
        breadcrumb={{
          listHref: "/identity/dashboard",
          listLabel: "Audit",
          currentLabel: data?.action ?? eventId,
          middleSegments: data?.action ? [{ label: eventId, mono: true }] : [],
        }}
        badge={data ? <IdentityStatusBadge state={data.result === "success" ? "active" : "locked"} /> : undefined}
      />

      {data ? (
        <>
          <SettingsSection id="metadata" title="Metadata">
            <MetadataList
              items={[
                { label: "Event ID", value: data.id, mono: true },
                { label: "Occurred at", value: formatWhen(data.occurred_at) },
                { label: "Action", value: data.action, mono: true },
                { label: "Result", value: <IdentityStatusBadge state={data.result === "success" ? "active" : "locked"} /> },
                {
                  label: "Actor",
                  value: `${data.actor_kind}${data.actor_id ? ` / ${data.actor_id}` : ""}`,
                  mono: true,
                },
                {
                  label: "Target",
                  value: `${data.target_type || "—"}${data.target_id ? ` / ${data.target_id}` : ""}`,
                  mono: true,
                },
                { label: "IP address", value: data.ip || "—", mono: true },
                { label: "User agent", value: data.user_agent || "—" },
              ]}
            />
          </SettingsSection>

          <SettingsSection id="payload" title="Payload">
            <pre className="max-h-96 overflow-auto rounded-md border border-border/60 bg-muted/20 p-4 font-mono text-xs">
              {JSON.stringify(data.payload, null, 2)}
            </pre>
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
