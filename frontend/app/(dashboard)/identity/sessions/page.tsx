"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSection } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { listAdminSessions, revokeAdminSession, revokeAllAdminSessions } from "@/lib/identity-admin-api";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function parseUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "Unknown device";
  if (ua.length <= 64) return ua;
  return `${ua.slice(0, 60)}…`;
}

export default function IdentitySessionsPage() {
  const { token, refreshToken } = useAppContext();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["identity-admin-sessions", token],
    queryFn: () => listAdminSessions(token, refreshToken, 300),
    enabled: Boolean(token?.trim()),
  });

  const revokeOne = useMutation({
    mutationFn: (sessionId: string) => revokeAdminSession(token, sessionId),
    onSuccess: async () => {
      toastSuccess("Session revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-admin-sessions", token] });
    },
    onError: (e) => toastError("Revoke failed", String((e as Error)?.message || e)),
  });

  const revokeAll = useMutation({
    mutationFn: () => revokeAllAdminSessions(token),
    onSuccess: async () => {
      toastSuccess("All sessions revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-admin-sessions", token] });
    },
    onError: (e) => toastError("Revoke all failed", String((e as Error)?.message || e)),
  });

  const items = sessionsQuery.data || [];

  return (
    <DetailSection
      title="Active sessions"
      description="All non-revoked user sessions across the platform"
      headerActions={
        <Button
          size="sm"
          variant="destructive"
          disabled={revokeAll.isPending || items.length === 0}
          onClick={() => revokeAll.mutate()}
        >
          Revoke all sessions
        </Button>
      }
    >
      {sessionsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {sessionsQuery.error ? (
        <p className="text-sm text-destructive">{(sessionsQuery.error as Error).message}</p>
      ) : null}
      <div className="space-y-3">
        {items.length === 0 && !sessionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : null}
        {items.map((session) => (
          <div key={session.id} className="panel-surface flex flex-wrap items-start justify-between gap-3 rounded-md border p-4">
            <div className="flex min-w-0 gap-3">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{parseUserAgent(session.user_agent)}</span>
                  {session.is_current ? (
                    <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
                      Current
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {session.username} · {session.ip || "Unknown IP"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Login {formatWhen(session.created_at)} · Last activity {formatWhen(session.last_used_at || session.created_at)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={revokeOne.isPending}
              onClick={() => revokeOne.mutate(session.id)}
            >
              Revoke
            </Button>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
