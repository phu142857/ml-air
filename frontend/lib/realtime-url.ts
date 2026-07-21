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
  return `${wsProto}://${host}/ws`;
}

/**
 * All-in-one runs realtime on loopback :8001 inside the container; browsers reach it via nginx `/ws`.
 * Rewrite stale env values like `ws://localhost:8001` when the Hub is served on another port.
 */
export function sanitizeRealtimeWsBaseForBrowser(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed || typeof window === "undefined") return trimmed;

  try {
    const normalized = trimmed.startsWith("ws://") || trimmed.startsWith("wss://")
      ? trimmed
      : `ws://${trimmed}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    const pageHost = window.location.hostname.toLowerCase();
    const pagePort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    const targetPort = parsed.port || (parsed.protocol === "wss:" ? "443" : "80");

    if (isLoopback && pageHost !== host) {
      const inferred = inferRealtimeWsBaseFromLocation();
      if (inferred) return inferred;
    }

    const isInternalPort = parsed.port === "8001" || (!parsed.port && isLoopback);
    if (isLoopback && isInternalPort) {
      if (pageHost === host && targetPort === pagePort) return stripTrailingSlash(trimmed);
      const inferred = inferRealtimeWsBaseFromLocation();
      if (inferred) return inferred;
    }

    if (isLoopback && pageHost === host && targetPort !== pagePort) {
      const inferred = inferRealtimeWsBaseFromLocation();
      if (inferred) return inferred;
    }
  } catch {
    /* keep original */
  }
  return stripTrailingSlash(trimmed);
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
  if (explicit) return sanitizeRealtimeWsBaseForBrowser(stripTrailingSlash(explicit));
  const inferred = inferRealtimeWsBaseFromLocation();
  if (inferred) return stripTrailingSlash(inferred);
  return "ws://localhost:8080/ws";
}

export function isRealtimeConfigured(
  runtimeUrl?: string | null,
  buildEnvUrl?: string | null,
): boolean {
  return Boolean(resolveRealtimeWsBase(runtimeUrl, buildEnvUrl));
}
