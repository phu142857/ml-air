"use client";

import { useEffect, useRef } from "react";
import { useAppContext } from "@/lib/app-context";
import { DEFAULT_SESSION_ENDED_MESSAGE, isAuthSessionFailure } from "@/lib/auth-session";
import { fetchIdentityMe, refreshIdentityDeduped, saveAuthSession } from "@/lib/identity-api";

const SESSION_CHECK_MS = 30_000;

export function useAuthSessionWatch() {
  const { token, refreshToken, username, setToken, setRefreshToken, forceLogout } = useAppContext();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!token.trim()) return;

    const verify = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        await fetchIdentityMe(token);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isAuthSessionFailure(message)) return;

        if (refreshToken.trim()) {
          try {
            const refreshed = await refreshIdentityDeduped(refreshToken);
            saveAuthSession({
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              username: username || undefined,
            });
            setToken(refreshed.access_token);
            setRefreshToken(refreshed.refresh_token);
            await fetchIdentityMe(refreshed.access_token);
            return;
          } catch {
            // refresh failed — session revoked or account removed
          }
        }

        void forceLogout(
          message.includes("revoked")
            ? "Your session was revoked. Sign in again."
            : message.includes("disabled") || message.includes("deleted")
              ? "Your account is no longer active. Sign in again."
              : DEFAULT_SESSION_ENDED_MESSAGE,
        );
      } finally {
        checkingRef.current = false;
      }
    };

    void verify();
    const interval = window.setInterval(() => void verify(), SESSION_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void verify();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, refreshToken, username, setToken, setRefreshToken, forceLogout]);
}
