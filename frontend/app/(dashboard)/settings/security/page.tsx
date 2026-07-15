"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LifecycleAction,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { changeIdentityPassword } from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { toastError, toastSuccess } from "@/lib/toast-actions";

export default function SettingsSecurityPage() {
  const { username, logout, token } = useAppContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => changeIdentityPassword(token, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastSuccess("Password updated");
    },
    onError: (e) => toastError("Password change failed", String((e as Error)?.message || e)),
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const dirty = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
  const canSave =
    currentPassword.trim().length > 0 &&
    newPassword.trim().length >= 8 &&
    newPassword === confirmPassword &&
    !mutation.isPending;

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Security"
        description="Authentication, credentials, and session hygiene for your account."
      />

      <SettingsSection id="authentication" title="Authentication" description="Current Hub session.">
        <p className="text-sm text-foreground">
          Signed in as <span className="font-medium">{username || "—"}</span>
        </p>
        <div className="mt-4 space-y-3">
          <LifecycleAction
            title="Sign out"
            description="Ends your current browser session on this device."
            actionLabel="Sign out"
            onAction={() => logout()}
          />
          <Button variant="outline" size="sm" asChild className="w-fit">
            <Link href="/settings/sessions">View sessions</Link>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection id="password" title="Password" description="Update your Hub sign-in password.">
        <div className="grid max-w-md gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="h-9"
              aria-invalid={mismatch}
            />
            {mismatch ? <p className="text-xs text-destructive">Passwords do not match</p> : null}
          </div>
        </div>
        <SettingsFormFooter
          dirty={dirty}
          saving={mutation.isPending}
          saveLabel="Update password"
          onSave={() => {
            if (canSave) mutation.mutate();
          }}
          onCancel={() => {
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
          }}
        />
        {mutation.isPending ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection id="mfa" title="Multi-factor authentication" description="Additional verification at sign-in.">
        <p className="text-sm text-muted-foreground">
          MFA is not enabled on this deployment. Support for TOTP and WebAuthn is planned.
        </p>
      </SettingsSection>

      <SettingsSection id="recovery" title="Recovery" description="Options if you lose access.">
        <p className="text-sm text-muted-foreground">
          Contact your platform administrator to reset access if you are locked out.
        </p>
      </SettingsSection>
    </SettingsPage>
  );
}
