export const AUTH_LOGOUT_REASON_KEY = "ml-air:logout-reason";

export function stashLogoutReason(message: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_LOGOUT_REASON_KEY, message);
  } catch {
    // ignore storage failures
  }
}

export function consumeLogoutReason(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(AUTH_LOGOUT_REASON_KEY);
    if (value) sessionStorage.removeItem(AUTH_LOGOUT_REASON_KEY);
    return value;
  } catch {
    return null;
  }
}

export function isAuthSessionFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid_token") ||
    m.includes("invalid or expired token") ||
    m.includes("session revoked") ||
    m.includes("session expired") ||
    m.includes("account_disabled") ||
    m.includes("account is disabled") ||
    m.includes("account is deleted") ||
    m.includes("missing_authorization") ||
    m.includes("invalid credential")
  );
}

export const DEFAULT_SESSION_ENDED_MESSAGE = "Your session ended. Sign in again.";
