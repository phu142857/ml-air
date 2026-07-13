"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailSection, ResourcePageHeader } from "@/components/mlops/layout";
import {
  AssignmentEditor,
  assignmentsToDrafts,
  draftsToAssignments,
  type AssignmentDraft,
} from "@/components/admin/assignment-editor";
import { useAppContext } from "@/lib/app-context";
import {
  getUser,
  listUserAssignments,
  patchUser,
  replaceUserAssignments,
} from "@/lib/identity-admin-api";

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = String(params.userId || "");
  const { token } = useAppContext();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const userQuery = useQuery({
    queryKey: ["admin-user", userId, token],
    queryFn: () => getUser(token, userId),
    enabled: Boolean(token?.trim() && userId),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["admin-user-assignments", userId, token],
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
      await qc.invalidateQueries({ queryKey: ["admin-user-assignments", userId] });
      setInitialized(false);
    },
  });

  const patchState = useMutation({
    mutationFn: (state: string) => patchUser(token, userId, { state }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-user", userId] }),
  });

  const resetPassword = useMutation({
    mutationFn: () => patchUser(token, userId, { password: newPassword }),
    onSuccess: () => setNewPassword(""),
  });

  const user = userQuery.data;
  const isGlobalAdmin = Boolean(user?.is_global_admin);

  return (
    <div className="space-y-6 p-6">
      <ResourcePageHeader
        icon={User}
        accent="zinc"
        title={user?.username ? `User: ${user.username}` : "User"}
        subtitle={userId}
        actions={
          <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
            Back to users
          </Link>
        }
      />

      {userQuery.error ? (
        <p className="text-sm text-destructive">{(userQuery.error as Error).message}</p>
      ) : null}

      {user ? (
        <DetailSection title="Account" description="Identity state and admin flag">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>State</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={user.state}
                onChange={(e) => patchState.mutate(e.target.value)}
              >
                {["active", "disabled", "locked", "pending_activation"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-sm">
              <Label>Global admin</Label>
              <p>{isGlobalAdmin ? "Yes (bypass — no assignments required)" : "No"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Reset password</Label>
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
          </div>
        </DetailSection>
      ) : null}

      {!isGlobalAdmin ? (
        <DetailSection
          title="Role assignments"
          description="Tenant → Role → All projects or selected projects (P5)"
        >
          <AssignmentEditor token={token} value={drafts} onChange={setDrafts} />
          <div className="mt-4 flex justify-end">
            <Button onClick={() => saveAssignments.mutate()} disabled={saveAssignments.isPending}>
              Save assignments
            </Button>
          </div>
          {saveAssignments.error ? (
            <p className="mt-2 text-sm text-destructive">{(saveAssignments.error as Error).message}</p>
          ) : null}
        </DetailSection>
      ) : (
        <p className="text-sm text-muted-foreground">Global administrators do not use role assignments.</p>
      )}
    </div>
  );
}
