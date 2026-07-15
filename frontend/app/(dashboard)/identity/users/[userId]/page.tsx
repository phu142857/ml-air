"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailSection } from "@/components/mlops/layout";
import { useToast } from "@/hooks/use-toast";
import {
  AssignmentEditor,
  assignmentsToDrafts,
  draftsToAssignments,
  type AssignmentDraft,
} from "@/components/admin/assignment-editor";
import { useAppContext } from "@/lib/app-context";
import {
  deleteUser,
  getUser,
  listUserAssignments,
  patchUser,
  replaceUserAssignments,
} from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

const USER_STATES = ["active", "disabled", "locked", "deleted"] as const;

export default function IdentityUserDetailPage() {
  const params = useParams();
  const userId = String(params.userId || "");
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const userQuery = useQuery({
    queryKey: ["identity-user", userId, token],
    queryFn: () => getUser(token, userId),
    enabled: Boolean(token?.trim() && userId),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["identity-user-assignments", userId, token],
    queryFn: () => listUserAssignments(token, userId),
    enabled: Boolean(token?.trim() && userId),
  });

  useEffect(() => {
    if (!assignmentsQuery.data || initialized) return;
    setDrafts(assignmentsToDrafts(assignmentsQuery.data));
    setInitialized(true);
  }, [assignmentsQuery.data, initialized]);

  const saveAssignments = useMutation({
    mutationFn: () => replaceUserAssignments(token, userId, draftsToAssignments(drafts)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["identity-user-assignments", userId] });
      setInitialized(false);
      toast({ title: "Role assignments saved" });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Save assignments failed",
        description: formatApiClientError(e),
      });
    },
  });

  const patchState = useMutation({
    mutationFn: (state: string) => patchUser(token, userId, { state }),
    onSuccess: (_data, state) => {
      qc.invalidateQueries({ queryKey: ["identity-user", userId] });
      toast({ title: "User updated", description: `Status: ${state}` });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: formatApiClientError(e),
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: () => patchUser(token, userId, { password: newPassword }),
    onSuccess: () => {
      setNewPassword("");
      toast({ title: "Password updated" });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Password change failed",
        description: formatApiClientError(e),
      });
    },
  });

  const softDelete = useMutation({
    mutationFn: () => deleteUser(token, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-user", userId] });
      toast({ title: "User deleted" });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: formatApiClientError(e),
      });
    },
  });

  const user = userQuery.data;
  const isGlobalAdmin = Boolean(user?.is_global_admin);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{user?.username ? `User: ${user.username}` : "User"}</h2>
          <p className="font-mono text-xs text-muted-foreground">{userId}</p>
        </div>
        <Link href="/identity/users" className="text-sm text-muted-foreground hover:underline">
          Back to users
        </Link>
      </div>

      {userQuery.error ? (
        <p className="text-sm text-destructive">{(userQuery.error as Error).message}</p>
      ) : null}

      {user ? (
        <DetailSection title="Account" description="Status, password, and admin flag">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
                value={user.state}
                onChange={(e) => patchState.mutate(e.target.value)}
              >
                {USER_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-sm">
              <Label>Global admin</Label>
              <p>{isGlobalAdmin ? "Yes — bypasses tenant assignments" : "No"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Change password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newPassword || resetPassword.isPending}
              onClick={() => resetPassword.mutate()}
            >
              Apply password
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={user.state === "deleted" || softDelete.isPending}
              onClick={() => softDelete.mutate()}
            >
              Soft delete
            </Button>
          </div>
        </DetailSection>
      ) : null}

      {!isGlobalAdmin ? (
        <DetailSection title="Role assignments" description="Assign Maintainer or Viewer per tenant/project">
          <AssignmentEditor token={token} value={drafts} onChange={setDrafts} />
          <div className="mt-4 flex justify-end">
            <Button onClick={() => saveAssignments.mutate()} disabled={saveAssignments.isPending}>
              Save assignments
            </Button>
          </div>
        </DetailSection>
      ) : (
        <p className="text-sm text-muted-foreground">Global administrators do not use role assignments.</p>
      )}
    </div>
  );
}
