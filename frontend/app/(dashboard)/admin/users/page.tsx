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
import { PageScrollBody, ResourcePageHeader } from "@/components/mlops/layout";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { createUser, listUsers } from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

export default function AdminUsersPage() {
  const { token } = useAppContext();
  const { toast } = useToast();
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
    onSuccess: async (user) => {
      setOpen(false);
      setUsername("");
      setPassword("");
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageScrollBody
        variant="workspace"
        header={
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
        }
      >
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
        <div className="scroll-region min-h-0 flex-1 rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
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
      </PageScrollBody>

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
