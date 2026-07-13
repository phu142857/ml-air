"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
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
import { ResourcePageHeader } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { createUser, listUsers } from "@/lib/identity-admin-api";

export default function AdminUsersPage() {
  const { token } = useAppContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users", token],
    queryFn: () => listUsers(token),
    enabled: Boolean(token?.trim()),
  });

  const createMut = useMutation({
    mutationFn: () => createUser(token, { username: username.trim(), password, state: "active" }),
    onSuccess: async () => {
      setOpen(false);
      setUsername("");
      setPassword("");
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  return (
    <div className="space-y-4 p-6">
      <ResourcePageHeader
        icon={Users}
        accent="zinc"
        title="Users"
        subtitle="Human identities and role assignments"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create user
          </Button>
        }
      />
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">Global admin</th>
              <th className="px-3 py-2 text-left" />
            </tr>
          </thead>
          <tbody>
            {(data || []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.username}</td>
                <td className="px-3 py-2">{u.state}</td>
                <td className="px-3 py-2">{u.is_global_admin ? "yes" : "no"}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/users/${u.id}`} className="text-primary hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
