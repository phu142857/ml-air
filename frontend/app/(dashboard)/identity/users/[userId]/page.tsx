"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AssignmentEditor,
  assignmentsToDrafts,
  createAssignmentDraft,
  draftsToAssignments,
  type AssignmentDraft,
} from "@/components/admin/assignment-editor";
import {
  ConfirmDestructiveDialog,
  DangerZone,
  DangerZoneAction,
  IdentityStatusBadge,
  LifecycleAction,
  MetadataList,
  SettingsEmptyState,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import {
  deleteUser,
  getUser,
  listUserAssignments,
  patchUser,
  replaceUserAssignments,
} from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentityUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.userId || "");
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [assignmentsBaseline, setAssignmentsBaseline] = useState<AssignmentDraft[]>([]);
  const [assignmentsInit, setAssignmentsInit] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    if (!assignmentsQuery.data || assignmentsInit) return;
    const next = assignmentsToDrafts(assignmentsQuery.data);
    setDrafts(next);
    setAssignmentsBaseline(next);
    setAssignmentsInit(true);
  }, [assignmentsQuery.data, assignmentsInit]);

  const assignmentsDirty = useMemo(
    () => JSON.stringify(drafts) !== JSON.stringify(assignmentsBaseline),
    [drafts, assignmentsBaseline],
  );

  const saveAssignments = useMutation({
    mutationFn: () => replaceUserAssignments(token, userId, draftsToAssignments(drafts)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["identity-user-assignments", userId] });
      setAssignmentsBaseline(drafts);
      toast({ title: "Role assignments saved" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Save failed", description: formatApiClientError(e) });
    },
  });

  const patchState = useMutation({
    mutationFn: (state: string) => patchUser(token, userId, { state }),
    onSuccess: (_data, state) => {
      qc.invalidateQueries({ queryKey: ["identity-user", userId] });
      toast({ title: "Account status updated", description: `Status is now ${state}.` });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Update failed", description: formatApiClientError(e) });
    },
  });

  const resetPassword = useMutation({
    mutationFn: () => patchUser(token, userId, { password: newPassword }),
    onSuccess: () => {
      setNewPassword("");
      toast({ title: "Password updated" });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Password change failed", description: formatApiClientError(e) });
    },
  });

  const deleteUserMut = useMutation({
    mutationFn: () => deleteUser(token, userId),
    onSuccess: async () => {
      setDeleteOpen(false);
      await qc.invalidateQueries({ queryKey: ["identity-users"] });
      toast({ title: "User deleted", description: "The user was permanently removed." });
      router.push("/identity/users");
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Delete failed", description: formatApiClientError(e) });
    },
  });

  const user = userQuery.data;
  const isGlobalAdmin = Boolean(user?.is_global_admin);
  const passwordDirty = newPassword.trim().length > 0;

  return (
    <SettingsPage loading={userQuery.isLoading} error={userQuery.error ? (userQuery.error as Error).message : null}>
      <SettingsPageHeader
        title={user?.username || "User"}
        description="Account metadata, assignments, and lifecycle actions."
        breadcrumb={{
          listHref: "/identity/users",
          listLabel: "Users",
          currentLabel: user?.username ?? userId,
          currentMono: !user?.username,
        }}
        secondaryActions={
          isGlobalAdmin ? (
            <Badge variant="outline" className="text-[10px]">
              Global admin
            </Badge>
          ) : null
        }
      />

      {user ? (
        <>
          <SettingsSection id="metadata" title="Metadata">
            <MetadataList
              items={[
                { label: "User ID", value: userId, mono: true },
                { label: "Username", value: user.username, mono: true },
                { label: "Status", value: <IdentityStatusBadge state={user.state} /> },
                { label: "Global admin", value: isGlobalAdmin ? "Yes" : "No" },
                { label: "Created", value: formatWhen(user.created_at) },
                { label: "Updated", value: formatWhen(user.updated_at) },
              ]}
            />
          </SettingsSection>

          <SettingsSection
            id="configuration"
            title="Configuration"
          >
            <div className="max-w-md space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-new-password">New password</Label>
                <Input
                  id="admin-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-9"
                />
              </div>
              <SettingsFormFooter
                dirty={passwordDirty}
                saving={resetPassword.isPending}
                saveLabel="Update password"
                onSave={() => resetPassword.mutate()}
                onCancel={() => setNewPassword("")}
              />
            </div>
          </SettingsSection>

          {!isGlobalAdmin ? (
            <SettingsSection
              id="permissions"
              title="Role assignments"
            >
              {assignmentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading assignments…</p>
              ) : (
                <>
                  {(assignmentsQuery.data || []).length === 0 && drafts.length === 0 ? (
                    <SettingsEmptyState
                      title="No roles assigned"
                      actionLabel="Add role assignment"
                      onAction={() => setDrafts([createAssignmentDraft()])}
                    />
                  ) : null}
                  {drafts.length > 0 || (assignmentsQuery.data || []).length > 0 ? (
                    <>
                      <AssignmentEditor token={token} value={drafts} onChange={setDrafts} />
                      <SettingsFormFooter
                        dirty={assignmentsDirty}
                        saving={saveAssignments.isPending}
                        saveLabel="Save assignments"
                        onSave={() => saveAssignments.mutate()}
                        onCancel={() => setDrafts(assignmentsBaseline)}
                      />
                    </>
                  ) : null}
                </>
              )}
            </SettingsSection>
          ) : (
            <SettingsSection id="permissions" title="Permissions">
              <p className="text-sm text-muted-foreground">
                This account has platform-wide access. Role assignments do not apply.
              </p>
            </SettingsSection>
          )}

          <SettingsSection id="lifecycle" title="Lifecycle">
            <div className="space-y-3">
              <LifecycleAction
                title="Enable account"
                actionLabel="Enable"
                disabled={user.state === "active"}
                pending={patchState.isPending}
                onAction={() => patchState.mutate("active")}
              />
              <LifecycleAction
                title="Disable account"
                actionLabel="Disable"
                disabled={user.state === "disabled"}
                pending={patchState.isPending}
                onAction={() => patchState.mutate("disabled")}
              />
              <LifecycleAction
                title="Lock account"
                actionLabel="Lock"
                disabled={user.state === "locked"}
                pending={patchState.isPending}
                onAction={() => patchState.mutate("locked")}
              />
            </div>
          </SettingsSection>

          <DangerZone>
            <DangerZoneAction
              title="Delete user"
              action={
                <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete user
                </Button>
              }
            />
          </DangerZone>

          <ConfirmDestructiveDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete user "${user.username}"?`}
            description="This action permanently removes the user from the platform."
            impact={[
              "All role assignments are deleted.",
              "Active sessions and API tokens stop working immediately.",
              "Audit history is retained; the user record is not recoverable.",
            ]}
            confirmText={user.username}
            confirmLabel="Delete permanently"
            pending={deleteUserMut.isPending}
            onConfirm={() => deleteUserMut.mutate()}
          />
        </>
      ) : null}
    </SettingsPage>
  );
}
