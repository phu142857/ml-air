"use client";

import Link from "next/link";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { useAppContext } from "@/lib/app-context";

export default function SettingsSecurityPage() {
  const { username, logout } = useAppContext();

  return (
    <div className="space-y-6">
      <DetailSection title="Authentication" description="How you sign in to MLAir Hub." accentBorder="sky">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {username ? (
            <span>
              Signed in as <strong className="text-foreground">{username}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground">Not signed in</span>
          )}
          <Badge variant="outline" className="text-[10px]">
            Hub session
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
            Sign out
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/settings/sessions">Manage sessions</Link>
          </Button>
        </div>
      </DetailSection>

      <PasswordChangeForm />

      <DetailSection title="Multi-factor authentication" description="Additional verification for sign-in." accentBorder="none">
        <p className="text-sm text-muted-foreground">
          MFA is not enabled on this deployment yet. Support for TOTP and WebAuthn is planned.
        </p>
      </DetailSection>

      <DetailSection title="Recovery" description="Account recovery options." accentBorder="none">
        <p className="text-sm text-muted-foreground">
          Contact your platform administrator to reset access if you are locked out.
        </p>
      </DetailSection>
    </div>
  );
}
