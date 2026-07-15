"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Monitor } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchIdentitySessions, revokeIdentitySession } from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
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

export function SessionsPanel() {
  const { token, refreshToken } = useAppContext();
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ["identity-sessions", token],
    queryFn: () => fetchIdentitySessions(token, refreshToken),
    enabled: Boolean(token.trim()),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => revokeIdentitySession(token, sessionId),
    onSuccess: async () => {
      toastSuccess("Session revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-sessions", token] });
    },
    onError: (e) => toastError("Revoke failed", String((e as Error)?.message || e)),
  });

  const items = sessionsQuery.data || [];

  return (
    <DetailSection
      title="Active sessions"
      description="Devices signed in to your account. Revoke any session you do not recognize."
      accentBorder="sky"
    >
      {sessionsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sessions…
        </div>
      ) : null}
      {sessionsQuery.error ? (
        <p className="text-sm text-destructive">{String((sessionsQuery.error as Error).message)}</p>
      ) : null}
      <div className="space-y-3">
        {items.length === 0 && !sessionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : null}
        {items.map((session) => (
          <div key={session.id} className="panel-surface flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="flex min-w-0 gap-3">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{parseUserAgent(session.user_agent)}</span>
                  {session.is_current ? (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      Current
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {session.ip || "Unknown IP"} · Last active {formatWhen(session.last_used_at || session.created_at)}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">{session.id}</p>
              </div>
            </div>
            {!session.is_current ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(session.id)}
              >
                Revoke
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
