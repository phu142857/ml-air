"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeIdentityPassword } from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { toastError, toastSuccess } from "@/lib/toast-actions";

export function PasswordChangeForm() {
  const { token } = useAppContext();
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
  const canSubmit =
    currentPassword.trim().length > 0 &&
    newPassword.trim().length >= 8 &&
    newPassword === confirmPassword &&
    !mutation.isPending;

  return (
    <DetailSection
      title="Password"
      accentBorder="violet"
    >
      <div className="space-y-3 max-w-md">
        <div>
          <Label className="text-xs">Current password</Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 h-8 text-xs"
            autoComplete="current-password"
          />
        </div>
        <div>
          <Label className="text-xs">New password</Label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 h-8 text-xs"
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label className="text-xs">Confirm new password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 h-8 text-xs"
            autoComplete="new-password"
          />
          {mismatch ? <p className="mt-1 text-xs text-destructive">Passwords do not match</p> : null}
        </div>
        <Button type="button" size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Update password
        </Button>
      </div>
    </DetailSection>
  );
}
