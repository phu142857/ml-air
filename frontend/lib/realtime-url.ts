/**
 * Resolve WebSocket base URL for MLAir realtime (push sync).
 * Realtime is on by default; env/runtime overrides are optional for production topology.
 */

const DEFAULT_DEV_REALTIME_WS = "ws://localhost:8001";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Infer browser-reachable realtime URL when deploy config omits it (local / quickstart). */
export function inferRealtimeWsBaseFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const { hostname, protocol } = window.location;
  const host = hostname.trim().toLowerCase();
  if (!host) return null;

  const wsProto = protocol === "https:" ? "wss" : "ws";

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return DEFAULT_DEV_REALTIME_WS;
  }

  // Published quickstart: UI :38080, realtime :8001 on same host.
  return `${wsProto}://${hostname}:8001`;
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
  return stripTrailingSlash(inferRealtimeWsBaseFromLocation() ?? DEFAULT_DEV_REALTIME_WS);
}

export function isRealtimeConfigured(
  runtimeUrl?: string | null,
  buildEnvUrl?: string | null,
): boolean {
  return Boolean(resolveRealtimeWsBase(runtimeUrl, buildEnvUrl));
}
