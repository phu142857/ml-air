"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IdentityStatusBadge,
  MetadataList,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import {
  createPersonalAccessToken,
  fetchPersonalAccessTokens,
  revokePersonalAccessToken,
} from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { copyWithToast, toastError, toastSuccess } from "@/lib/toast-actions";
import { getApiBaseUrl } from "@/lib/api";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PatPanel() {
  const { token } = useAppContext();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [expiresDays, setExpiresDays] = useState("90");
  const [newToken, setNewToken] = useState<string | null>(null);
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
      setNewToken(created.token);
      setDescription("");
      toastSuccess("Personal access token created");
      await queryClient.invalidateQueries({ queryKey: ["identity-pats", token] });
    },
    onError: (e) => toastError("Create failed", String((e as Error)?.message || e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (patId: string) => revokePersonalAccessToken(token, patId),
    onSuccess: async () => {
      toastSuccess("Token revoked");
      await queryClient.invalidateQueries({ queryKey: ["identity-pats", token] });
    },
    onError: (e) => toastError("Revoke failed", String((e as Error)?.message || e)),
  });

  const apiBase = getApiBaseUrl();
  const activePats = (patsQuery.data || []).filter((p) => !p.revoked_at);

  return (
    <SettingsPage loading={patsQuery.isLoading} error={patsQuery.error ? String((patsQuery.error as Error).message) : null}>
      <SettingsPageHeader
        title="CLI & API tokens"
        description="Connect automation and local tooling to the MLAir control plane."
      />

      <SettingsSection id="configuration" title="Configuration" description="API endpoint for CLI and SDK clients.">
        <div className="rounded-md border border-border/60 bg-muted/20 p-4 font-mono text-xs">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recommended setup</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-foreground">{`# Sign in via Hub (recommended)
open ${typeof window !== "undefined" ? window.location.origin : ""}/login

# Configure API endpoint
export MLAIR_API_URL="${apiBase}/v1"`}</pre>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Native <span className="font-mono">mlair login</span> device flow is planned — use personal access tokens for scripts today.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection id="general" title="General" description="Create a new personal access token.">
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

        {newToken ? (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium text-primary">Copy your new token now</p>
            <p className="mt-1 text-xs text-muted-foreground">This secret cannot be shown again after you leave this page.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-[11px]">
                {newToken}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Copy token"
                onClick={() => {
                  void copyWithToast(newToken, { successTitle: "Token copied" }).then((ok) => {
                    if (ok) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  });
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection id="tokens" title="Active tokens" description="Tokens currently authorized for API access.">
        {activePats.length === 0 ? (
          <SettingsEmptyState
            title="No active tokens"
            description="Generate a token above to authenticate scripts and automation."
          />
        ) : (
          <div className="space-y-3">
            {activePats.map((pat) => (
              <div
                key={pat.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/60 p-4"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{pat.description}</span>
                    <IdentityStatusBadge state="active" />
                  </div>
                  <MetadataList
                    items={[
                      { label: "Created", value: formatWhen(pat.created_at) },
                      { label: "Expires", value: pat.expires_at ? formatWhen(pat.expires_at) : "Never" },
                      { label: "Last used", value: formatWhen(pat.last_used_at) },
                      { label: "ID", value: pat.id, mono: true },
                    ]}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(pat.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
