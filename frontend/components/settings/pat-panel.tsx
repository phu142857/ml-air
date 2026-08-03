"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Key, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import {
  createPersonalAccessToken,
  fetchPersonalAccessTokens,
  revokePersonalAccessToken,
  type PersonalAccessTokenRow,
} from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { copyWithToast, toastError, toastSuccess } from "@/lib/toast-actions";
import { getApiBaseUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRemaining(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "Never";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 365) return `${Math.ceil(days / 365)}y left`;
  if (days >= 30) return `${Math.ceil(days / 30)}mo left`;
  if (days >= 1) return `${days}d left`;
  const hours = Math.ceil(ms / 3_600_000);
  return `${Math.max(1, hours)}h left`;
}

function expiresInDaysFromPat(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function shortToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}

type RevealedPat = {
  id: string;
  token: string;
};

export function PatPanel() {
  const { token } = useAppContext();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [expiresDays, setExpiresDays] = useState("90");
  const [revealedPat, setRevealedPat] = useState<RevealedPat | null>(null);
  const [copied, setCopied] = useState(false);

  const patsQuery = useQuery({
    queryKey: ["identity-pats", token],
    queryFn: () => fetchPersonalAccessTokens(token),
    enabled: Boolean(token.trim()),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPersonalAccessToken(
        token,
        description,
        expiresDays.trim() ? Number.parseInt(expiresDays, 10) : null,
      ),
    onSuccess: async (created) => {
      setRevealedPat({ id: created.id, token: created.token });
      setCopied(false);
      setDescription("");
      toastSuccess("Personal access token created");
      await queryClient.invalidateQueries({ queryKey: ["identity-pats", token] });
    },
    onError: (e) => toastError("Create failed", String((e as Error)?.message || e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (patId: string) => revokePersonalAccessToken(token, patId),
    onSuccess: async (_data, patId) => {
      setRevealedPat((prev) => (prev?.id === patId ? null : prev));
      toastSuccess("Token revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-pats", token] });
    },
    onError: (e) => toastError("Revoke failed", String((e as Error)?.message || e)),
  });

  const rotateMutation = useMutation({
    mutationFn: async (pat: PersonalAccessTokenRow) => {
      const created = await createPersonalAccessToken(
        token,
        pat.description,
        expiresInDaysFromPat(pat.expires_at),
      );
      await revokePersonalAccessToken(token, pat.id);
      return created;
    },
    onSuccess: async (created) => {
      setRevealedPat({ id: created.id, token: created.token });
      setCopied(false);
      toastSuccess("Token rotated", "Copy the replacement token now. The previous token has been revoked.");
      await queryClient.invalidateQueries({ queryKey: ["identity-pats", token] });
    },
    onError: (e) => toastError("Rotate failed", String((e as Error)?.message || e)),
  });

  const apiBase = getApiBaseUrl();
  const activePats = (patsQuery.data || []).filter((p) => !p.revoked_at);

  const handleCopy = (secret: string) => {
    void copyWithToast(secret, { successTitle: "Token copied" }).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  return (
    <SettingsPage loading={patsQuery.isLoading} error={patsQuery.error ? String((patsQuery.error as Error).message) : null}>
      <SettingsPageHeader
        title="CLI & API"
        description="Configure the MLAir CLI and manage personal access tokens."
      />

      <SettingsSection
        id="cli-configuration"
        title="CLI configuration"
        description="Point the CLI at this Hub API endpoint."
      >
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-xs text-foreground whitespace-pre-wrap">{`export MLAIR_API_URL="${apiBase}/v1"`}</pre>
      </SettingsSection>

      <SettingsSection
        id="personal-access-tokens"
        title="Personal access tokens"
        description="Tokens authenticate CLI and API access on your behalf."
      >
        <div className="grid max-w-lg gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pat-description">Description</Label>
            <Textarea
              id="pat-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="CI deploy key, local development, …"
              rows={2}
              className="resize-y text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pat-expiry">Expiration (days)</Label>
            <Input
              id="pat-expiry"
              inputMode="numeric"
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="90 — leave empty for no expiry"
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            disabled={!description.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Key className="mr-2 h-3.5 w-3.5" />
            )}
            Generate token
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active tokens</p>
        {activePats.length === 0 ? (
          <SettingsEmptyState
            title="No active tokens"
          />
        ) : (
          <div className="space-y-3">
            {activePats.map((pat) => {
              const isRevealed = revealedPat?.id === pat.id;
              const secret = isRevealed ? revealedPat.token : null;

              return (
                <div
                  key={pat.id}
                  className={cn(
                    "rounded-md border p-4",
                    isRevealed ? "border-primary/40 bg-primary/5" : "border-border/60",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{pat.description}</span>
                      <IdentityStatusBadge state="active" />
                      {isRevealed && secret ? (
                        <code className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                          {shortToken(secret)}
                        </code>
                      ) : (
                        <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {pat.id.slice(0, 8)}...{pat.id.slice(-4)}
                        </code>
                      )}
                      <span className="text-xs text-muted-foreground">{formatRemaining(pat.expires_at)}</span>
                      <span className="text-xs text-muted-foreground">
                        Last used {formatWhen(pat.last_used_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRevealed && secret ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label="Copy token"
                          onClick={() => handleCopy(secret)}
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          Copy
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rotateMutation.isPending || revokeMutation.isPending}
                        onClick={() => rotateMutation.mutate(pat)}
                      >
                        {rotateMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        Rotate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rotateMutation.isPending || revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(pat.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
