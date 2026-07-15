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
import { DetailSection } from "@/components/mlops/layout";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { createUser, listUsers } from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

const USER_STATES = ["active", "disabled", "locked", "deleted"] as const;

export default function IdentityUsersPage() {
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const queryKey = useMemo(
    () => ["identity-users", token, stateFilter, q],
    [token, stateFilter, q],
  );

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

  return (
    <div className="space-y-4">
      <DetailSection
        title="Users"
        description="Human identities and role assignments"
        headerActions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create user
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            placeholder="Search username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 max-w-xs text-sm"
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {USER_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Global admin</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {(data || []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2 capitalize">{u.state}</td>
                  <td className="px-3 py-2">{u.is_global_admin ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/identity/users/${u.id}`} className="text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !username || !password}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
