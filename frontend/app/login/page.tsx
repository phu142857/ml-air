"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppContext } from "@/lib/app-context";
import {
  clearAuthSession,
  fetchIdentityMe,
  loadAuthSession,
  loginIdentity,
  refreshIdentityDeduped,
  saveAuthSession,
  verifyIdentityMfa,
} from "@/lib/identity-api";
import { VerificationCodeInput } from "@/components/auth/verification-code-input";
import { MlairLogo } from "@/components/brand/mlair-logo";
import { consumeLogoutReason } from "@/lib/auth-session";
import { resolveHubDefaultRoute, hubDefaultRoutePath } from "@/lib/hub-default-route";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, setRefreshToken } = useAppContext();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const redirectingRef = useRef(false);

  useEffect(() => {
    setSessionNotice(consumeLogoutReason());
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = loadAuthSession();
      if (!session?.accessToken?.trim() || !session.refreshToken?.trim()) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      let accessToken = session.accessToken;
      let refreshToken = session.refreshToken;

      try {
        await fetchIdentityMe(accessToken);
      } catch {
        try {
          const refreshed = await refreshIdentityDeduped(refreshToken);
          accessToken = refreshed.access_token;
          refreshToken = refreshed.refresh_token;
          saveAuthSession({
            accessToken,
            refreshToken,
            username: session.username,
          });
          await fetchIdentityMe(accessToken);
        } catch {
          clearAuthSession();
          setToken("");
          setRefreshToken("");
          if (!cancelled) setCheckingSession(false);
          return;
        }
      }

      if (cancelled || redirectingRef.current) return;
      redirectingRef.current = true;
      setToken(accessToken);
      setRefreshToken(refreshToken);
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : hubDefaultRoutePath(resolveHubDefaultRoute()));
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, setRefreshToken, setToken]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = mfaChallengeToken
        ? await verifyIdentityMfa(
            mfaChallengeToken,
            useRecoveryCode ? undefined : otpCode.trim(),
            useRecoveryCode ? recoveryCode.trim() : undefined,
          )
        : await loginIdentity(username.trim(), password);
      if (res.mfa_required && res.challenge_token) {
        setMfaChallengeToken(res.challenge_token);
        setOtpCode("");
        setRecoveryCode("");
        setUseRecoveryCode(false);
        return;
      }
      if (!res.access_token?.trim() || !res.refresh_token?.trim()) {
        throw new Error("Authentication did not return a valid session");
      }
      saveAuthSession({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        username: res.user.username,
      });
      setToken(res.access_token);
      setRefreshToken(res.refresh_token);
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : hubDefaultRoutePath(resolveHubDefaultRoute()));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 rounded-xl border border-border/70 bg-card p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <MlairLogo size="hero" priority alt="MLAir" className="rounded-xl p-1" />
          <div className="space-y-1">
            <h1 className="sr-only">MLAir Hub</h1>
            <p className="text-sm font-medium text-foreground">Sign in to MLAir Hub</p>
            <p className="text-xs text-muted-foreground">Lifecycle control plane for datasets, runs, and models</p>
          </div>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Username</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={Boolean(mfaChallengeToken)}
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            className="w-full rounded-md border bg-background px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={Boolean(mfaChallengeToken)}
            required
          />
        </label>
        {mfaChallengeToken ? (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">Multi-factor authentication required</p>
            {!useRecoveryCode ? (
              <VerificationCodeInput
                id="login-mfa-otp"
                length={6}
                mode="numeric"
                label="Authenticator code"
                value={otpCode}
                onChange={setOtpCode}
                disabled={loading}
                autoFocus
              />
            ) : (
              <VerificationCodeInput
                id="login-mfa-recovery"
                length={8}
                mode="alphanumeric"
                label="Recovery code"
                value={recoveryCode}
                onChange={setRecoveryCode}
                disabled={loading}
                autoFocus
              />
            )}
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setUseRecoveryCode((v) => !v);
                setOtpCode("");
                setRecoveryCode("");
              }}
            >
              {useRecoveryCode ? "Use authenticator code instead" : "Use a recovery code instead"}
            </button>
          </div>
        ) : null}
        {sessionNotice ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {sessionNotice}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={
            loading ||
            (Boolean(mfaChallengeToken) &&
              (useRecoveryCode ? recoveryCode.length < 8 : otpCode.length < 6))
          }
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Signing in…" : mfaChallengeToken ? "Verify and sign in" : "Sign in"}
        </button>
        {mfaChallengeToken ? (
          <button
            type="button"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            onClick={() => {
              setMfaChallengeToken(null);
              setOtpCode("");
              setRecoveryCode("");
              setUseRecoveryCode(false);
            }}
          >
            Start over
          </button>
        ) : null}
      </form>
    </div>
  );
}
