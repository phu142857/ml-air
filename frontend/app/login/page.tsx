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
} from "@/lib/identity-api";
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
      const res = await loginIdentity(username.trim(), password);
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold font-heading">MLAir Hub</h1>
          <p className="text-sm text-muted-foreground">Sign in with your account</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Username</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
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
            required
          />
        </label>
        {sessionNotice ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {sessionNotice}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
