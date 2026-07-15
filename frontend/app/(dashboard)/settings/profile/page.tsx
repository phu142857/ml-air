"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchIdentityMe, patchIdentityMe } from "@/lib/identity-api";
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

export default function SettingsProfilePage() {
  const { token, username, isGlobalAdmin } = useAppContext();
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["identity-me", token],
    queryFn: () => fetchIdentityMe(token),
    enabled: Boolean(token.trim()),
  });
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (meQuery.data) {
      setDisplayName(meQuery.data.display_name || "");
      setEmail(meQuery.data.email || "");
    }
  }, [meQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => patchIdentityMe(token, { display_name: displayName, email }),
    onSuccess: async () => {
      toastSuccess("Profile updated");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["identity-me", token] });
    },
    onError: (e) => toastError("Save failed", String((e as Error)?.message || e)),
  });

  const me = meQuery.data;

  return (
    <div className="space-y-6">
      <DetailSection
        title="Profile"
        description="Who you are on this MLAir control plane."
        accentBorder="violet"
        headerActions={
          !editing ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit profile
            </Button>
          ) : null
        }
      >
        {meQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile…
          </div>
        ) : null}
        {meQuery.error ? (
          <p className="text-sm text-destructive">{String((meQuery.error as Error).message)}</p>
        ) : null}
        {me ? (
          <div className="space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {(me.display_name || me.username || "?").slice(0, 1).toUpperCase()}
            </div>
            {editing ? (
              <div className="grid max-w-md gap-3">
                <div>
                  <Label className="text-xs">Display name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-8 text-xs" type="email" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Username</dt>
                  <dd className="font-mono">{me.username || username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Display name</dt>
                  <dd>{me.display_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd>{me.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Role</dt>
                  <dd>
                    {isGlobalAdmin || me.is_global_admin ? (
                      <Badge variant="outline" className="text-[10px]">
                        Global admin
                      </Badge>
                    ) : (
                      "Scoped user"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd>{formatWhen(me.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last login</dt>
                  <dd>{formatWhen(me.last_login_at)}</dd>
                </div>
              </dl>
            )}
          </div>
        ) : null}
      </DetailSection>

      {me?.assignments?.length ? (
        <DetailSection title="Tenant access" description="Roles from identity assignments (read-only)." accentBorder="amber">
          <ul className="space-y-2 text-sm">
            {me.assignments.map((a) => (
              <li key={a.id} className="font-mono text-xs text-muted-foreground">
                {a.tenant_id} · {a.role}
                {a.all_projects ? " · all projects" : ` · ${a.project_ids.join(", ")}`}
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}
    </div>
  );
}
