"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Key, Loader2 } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-6">
      <DetailSection
        title="Connect your local machine"
        description="Use a personal access token for CLI and automation. Session JWTs are not shown here."
        accentBorder="violet"
      >
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 font-mono text-xs">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CLI login (browser)</p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-foreground">{`# Sign in via Hub (recommended)
open ${typeof window !== "undefined" ? window.location.origin : ""}/login

# Then configure API endpoint
export MLAIR_API_URL="${apiBase}/v1"`}</pre>
          <p className="text-[10px] text-muted-foreground">
            Native <span className="font-mono">mlair login</span> device flow is planned — use PAT below for scripts today.
          </p>
        </div>
      </DetailSection>

      <DetailSection
        title="Personal access tokens"
        description="Generate tokens for API clients. Copy the secret once — it cannot be shown again."
        accentBorder="amber"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="CI deploy key"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Expiration (days, empty = no expiry)</Label>
            <Input
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="90"
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          disabled={!description.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Key className="mr-2 h-3.5 w-3.5" />}
          Generate token
        </Button>

        {newToken ? (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-primary">Copy your new token now</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{newToken}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
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

        <div className="mt-6 space-y-2">
          {patsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tokens…
            </div>
          ) : null}
          {activePats.length === 0 && !patsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">No active tokens.</p>
          ) : null}
          {activePats.map((pat) => (
            <div key={pat.id} className="panel-surface flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{pat.description}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {pat.expires_at ? `expires ${formatWhen(pat.expires_at)}` : "no expiry"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {formatWhen(pat.created_at)}
                  {pat.last_used_at ? ` · Last used ${formatWhen(pat.last_used_at)}` : ""}
                </p>
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
      </DetailSection>
    </div>
  );
}
