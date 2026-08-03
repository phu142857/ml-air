"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { VerificationCodeInput } from "@/components/auth/verification-code-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import {
  changeIdentityPassword,
  disableTotp,
  fetchMfaStatus,
  regenerateRecoveryCodes,
  startTotpEnroll,
  verifyTotpEnroll,
} from "@/lib/identity-api";
import { useAppContext } from "@/lib/app-context";
import { toastError, toastSuccess } from "@/lib/toast-actions";

export default function SettingsSecurityPage() {
  const { token } = useAppContext();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollOtpAuthUrl, setEnrollOtpAuthUrl] = useState("");
  const [enrollOtp, setEnrollOtp] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const mfaStatus = useQuery({
    queryKey: ["identity-mfa-status", token],
    queryFn: () => fetchMfaStatus(token),
    enabled: Boolean(token.trim()),
  });

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

  const enrollStartMutation = useMutation({
    mutationFn: () => startTotpEnroll(token),
    onSuccess: (res) => {
      setEnrollSecret(res.secret);
      setEnrollOtpAuthUrl(res.otpauth_url || "");
      setEnrollOtp("");
      setRecoveryCodes([]);
      toastSuccess("Authenticator setup started");
    },
    onError: (e) => toastError("Unable to start MFA setup", String((e as Error)?.message || e)),
  });

  const enrollVerifyMutation = useMutation({
    mutationFn: () => verifyTotpEnroll(token, enrollSecret, enrollOtp),
    onSuccess: async (res) => {
      setRecoveryCodes(res.recovery_codes || []);
      setEnrollOtp("");
      toastSuccess("MFA enabled");
      await queryClient.invalidateQueries({ queryKey: ["identity-mfa-status", token] });
    },
    onError: (e) => toastError("Invalid MFA code", String((e as Error)?.message || e)),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableTotp(token),
    onSuccess: async () => {
      setEnrollSecret("");
      setEnrollOtpAuthUrl("");
      setEnrollOtp("");
      setRecoveryCodes([]);
      toastSuccess("MFA disabled");
      await queryClient.invalidateQueries({ queryKey: ["identity-mfa-status", token] });
    },
    onError: (e) => toastError("Unable to disable MFA", String((e as Error)?.message || e)),
  });

  const regenCodesMutation = useMutation({
    mutationFn: () => regenerateRecoveryCodes(token),
    onSuccess: async (res) => {
      setRecoveryCodes(res.recovery_codes || []);
      toastSuccess("Recovery codes regenerated");
      await queryClient.invalidateQueries({ queryKey: ["identity-mfa-status", token] });
    },
    onError: (e) => toastError("Unable to regenerate codes", String((e as Error)?.message || e)),
  });

  return (
    <SettingsPage loading={mfaStatus.isLoading} error={mfaStatus.error ? String((mfaStatus.error as Error).message) : null}>
      <SettingsPageHeader
        title="Security"
        description="Manage password and multi-factor authentication."
      />

      <SettingsSection id="password" title="Password" description="Change the password for your account.">
        <div className="grid max-w-md gap-5">
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-[13px]">Current password</Label>
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
          saveLabel="Change password"
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

      <SettingsSection
        id="mfa"
        title="Multi-factor authentication"
        description="Add an authenticator app for stronger account security."
      >
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="text-sm font-medium text-foreground">
            {mfaStatus.data?.enabled ? "Configured" : "Not configured"}
          </p>
          {mfaStatus.data?.enabled_at ? (
            <p className="text-xs text-muted-foreground">Enabled {new Date(mfaStatus.data.enabled_at).toLocaleString()}</p>
          ) : null}
          {mfaStatus.data?.last_used_at ? (
            <p className="text-xs text-muted-foreground">Last verification {new Date(mfaStatus.data.last_used_at).toLocaleString()}</p>
          ) : null}
        </div>
        {!mfaStatus.data?.enabled ? (
          <div className="mt-4 space-y-3">
            {!enrollSecret ? (
              <Button type="button" size="sm" onClick={() => enrollStartMutation.mutate()} disabled={enrollStartMutation.isPending}>
                {enrollStartMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Set up authenticator app
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">
                  Add this key to your authenticator app, then enter the 6-digit code to verify.
                </p>
                {enrollOtpAuthUrl ? (
                  <div className="w-fit rounded-md border border-border/60 bg-background p-2">
                    <QRCodeSVG value={enrollOtpAuthUrl} size={176} />
                  </div>
                ) : null}
                <code className="block rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
                  {enrollSecret}
                </code>
                <VerificationCodeInput
                  id="mfa-code"
                  length={6}
                  mode="numeric"
                  label="Verification code"
                  value={enrollOtp}
                  onChange={setEnrollOtp}
                  disabled={enrollVerifyMutation.isPending}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => enrollVerifyMutation.mutate()}
                    disabled={enrollVerifyMutation.isPending || enrollOtp.length < 6}
                  >
                    {enrollVerifyMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Verify and enable
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEnrollSecret("");
                      setEnrollOtpAuthUrl("");
                      setEnrollOtp("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disableMutation.isPending}
              onClick={() => disableMutation.mutate()}
            >
              {disableMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Disable MFA
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection id="recovery" title="Recovery" description="Generate one-time codes to regain access if you lose your authenticator.">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Recovery methods</p>
          <p className="text-sm font-medium text-foreground">
            {mfaStatus.data?.enabled ? "Recovery codes" : "Not configured"}
          </p>
          {mfaStatus.data?.enabled ? (
            <p className="text-xs text-muted-foreground">
              {mfaStatus.data.recovery_codes_remaining} unused code{mfaStatus.data.recovery_codes_remaining === 1 ? "" : "s"} remaining
            </p>
          ) : null}
        </div>
        {mfaStatus.data?.enabled ? (
          <div className="mt-3 space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={regenCodesMutation.isPending}
              onClick={() => regenCodesMutation.mutate()}
            >
              {regenCodesMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Regenerate recovery codes
            </Button>
            {recoveryCodes.length > 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Save these codes now. They are shown only once.</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
                  {recoveryCodes.join("\n")}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Enable MFA first to receive one-time recovery codes.
          </p>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
