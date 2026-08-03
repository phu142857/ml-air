"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ConfirmDestructiveDialog,
  DangerZone,
  DangerZoneAction,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
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

function isSessionExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

export default function IdentitySessionsPage() {
  const { token, refreshToken } = useAppContext();
  const queryClient = useQueryClient();
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

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
      setRevokeAllOpen(false);
      toastSuccess("All sessions revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-admin-sessions", token] });
    },
    onError: (e) => toastError("Revoke all failed", String((e as Error)?.message || e)),
  });

  const rawItems = sessionsQuery.data || [];
  const items = rawItems.filter((session) => !isSessionExpired(session.expires_at));
  const expiredCount = Math.max(0, rawItems.length - items.length);

  return (
    <SettingsPage
      loading={sessionsQuery.isLoading}
      error={sessionsQuery.error ? String((sessionsQuery.error as Error).message) : null}
    >
      <SettingsPageHeader
        title="Sessions"
        description="Active identity sessions across the platform."
      />

      <SettingsSection id="sessions" title="Active sessions" description="Revoke sessions that should no longer be trusted.">
        {expiredCount > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Hidden {expiredCount} expired session{expiredCount > 1 ? "s" : ""} from the list.
          </p>
        ) : null}
        {items.length === 0 && !sessionsQuery.isLoading ? (
          <SettingsEmptyState title="No active sessions" />
        ) : (
          <div className="space-y-3">
            {items.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex min-w-0 gap-3">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{parseUserAgent(session.user_agent)}</span>
                      {session.is_current ? (
                        <Badge variant="outline" className="border-primary/30 text-[11px] text-primary">
                          Current
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {session.username} · {session.ip || "Unknown IP"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Login {formatWhen(session.created_at)} · Last activity{" "}
                      {formatWhen(session.last_used_at || session.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">Session expires {formatWhen(session.expires_at)}</p>
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
        )}
      </SettingsSection>

      <DangerZone>
        <DangerZoneAction
          title="Revoke all sessions"
          action={
            <Button
              size="sm"
              variant="destructive"
              disabled={revokeAll.isPending || items.length === 0}
              onClick={() => setRevokeAllOpen(true)}
            >
              Revoke all
            </Button>
          }
        />
      </DangerZone>

      <ConfirmDestructiveDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title="Revoke all sessions"
        description="This immediately signs out every user on the platform, including your current session after the next API call."
        impact={[
          "All interactive sessions will be invalidated.",
          "Workers using service account tokens are not affected.",
        ]}
        confirmLabel="Revoke all sessions"
        pending={revokeAll.isPending}
        onConfirm={() => revokeAll.mutate()}
      />
    </SettingsPage>
  );
}
