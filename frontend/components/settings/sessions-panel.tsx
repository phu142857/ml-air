"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DangerZone,
  DangerZoneAction,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
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
    <SettingsPage
      loading={sessionsQuery.isLoading}
      error={sessionsQuery.error ? String((sessionsQuery.error as Error).message) : null}
    >
      <SettingsPageHeader
        title="Sessions"
        description="Devices signed in to your account. Revoke any session you do not recognize."
      />

      <SettingsSection id="sessions" title="Active sessions" description="Browser and API sessions tied to your identity.">
        {items.length === 0 && !sessionsQuery.isLoading ? (
          <SettingsEmptyState
            title="No active sessions"
            description="When you sign in from a new device, it will appear here."
          />
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
                      <span className="text-sm font-medium text-foreground">{parseUserAgent(session.user_agent)}</span>
                      {session.is_current ? (
                        <Badge variant="outline" className="border-primary/30 text-[11px] text-primary">
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
        )}
      </SettingsSection>

      <DangerZone description="End all other sessions if you suspect unauthorized access.">
        <DangerZoneAction
          title="Revoke other sessions"
          description="Keeps your current browser session. All other devices will need to sign in again."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={items.filter((s) => !s.is_current).length === 0 || revokeMutation.isPending}
              onClick={async () => {
                for (const s of items) {
                  if (!s.is_current) await revokeMutation.mutateAsync(s.id);
                }
              }}
            >
              Revoke others
            </Button>
          }
        />
      </DangerZone>
    </SettingsPage>
  );
}
