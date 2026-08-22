"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { createUser, listUsers } from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

const USER_STATES = ["active", "disabled", "locked"] as const;

export default function IdentityUsersPage() {
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const queryKey = useMemo(() => ["identity-users", token, stateFilter, q], [token, stateFilter, q]);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      listUsers(token, {
        state: stateFilter || undefined,
        q: q.trim() || undefined,
        limit: 200,
      }),
    enabled: Boolean(token?.trim()),
  });

  const createMut = useMutation({
    mutationFn: () => createUser(token, { username: username.trim(), password, state: "active" }),
    onSuccess: async (user) => {
      setOpen(false);
      setUsername("");
      setPassword("");
      await qc.invalidateQueries({ queryKey: ["identity-users"] });
      toast({ title: "User created", description: user.username });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Create user failed",
        description: formatApiClientError(e),
      });
    },
  });

  const users = data || [];

  return (
    <SettingsPage loading={isLoading} error={error ? formatApiClientError(error) : null}>
      <SettingsPageHeader
        title="Users"
      />

      <SettingsSection
        id="directory"
        title="Directory"
        headerActions={
          <Button size="sm" className="h-8 gap-1.5 text-xs transition-colors duration-150" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create user
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 max-w-xs text-sm"
            aria-label="Search users"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {USER_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {users.length === 0 && !isLoading ? (
          <SettingsEmptyState
            title="No users found"
            {...(!q && !stateFilter ? { actionLabel: "Create user", onAction: () => setOpen(true) } : {})}
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Username</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Global admin</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3">
                      <IdentityStatusBadge state={u.state} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.is_global_admin ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-8" asChild>
                        <Link href={`/identity/users/${u.id}`}>Manage</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !username || !password}>
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
