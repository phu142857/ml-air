/**
 * Resolve WebSocket base URL for MLAir realtime (push sync).
 * Realtime is on by default; env/runtime overrides are optional for split-host deploys.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Infer browser-reachable realtime URL when deploy config omits it (same-origin Hub). */
export function inferRealtimeWsBaseFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const { protocol } = window.location;
  const host = window.location.host.trim();
  if (!host) return null;

  const wsProto = protocol === "https:" ? "wss" : "ws";
  return `${wsProto}://${host}`;
}

/**
 * Effective realtime WebSocket root (without `/ws` path — added at connect time).
 * Order: runtime inject → build env → location inference.
 */
export function resolveRealtimeWsBase(
  runtimeUrl?: string | null,
  buildEnvUrl?: string | null,
): string {
  const explicit = String(runtimeUrl ?? "").trim() || String(buildEnvUrl ?? "").trim();
  if (explicit) return stripTrailingSlash(explicit);
  const inferred = inferRealtimeWsBaseFromLocation();
  if (inferred) return stripTrailingSlash(inferred);
  return "ws://localhost:8080";
}

export function isRealtimeConfigured(
  runtimeUrl?: string | null,
  buildEnvUrl?: string | null,
): boolean {
  return Boolean(resolveRealtimeWsBase(runtimeUrl, buildEnvUrl));
}
