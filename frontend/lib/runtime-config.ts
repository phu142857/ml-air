import type { SemanticObservabilitySurface } from "./api";

declare global {
  interface Window {
    __ML_AIR_RUNTIME_CONFIG__?: {
      jaegerBaseUrl?: string;
      apiBaseUrl?: string;
      api_base_url?: string | null;
      realtime_base_url?: string | null;
      hub_default_route?: string | null;
      environment?: string;
      features?: Record<string, boolean>;
      observability?: {
        jaeger_ui_url?: string | null;
        grafana_ui_url?: string | null;
        semantic_observability_surfaces?: SemanticObservabilitySurface[];
      };
      tenantId?: string;
      projectId?: string;
    };
  }
}

export function getRuntimeConfig() {
  if (typeof window === "undefined") return null;
  return window.__ML_AIR_RUNTIME_CONFIG__ ?? null;
}

export type RuntimeConfigSlice = NonNullable<Window["__ML_AIR_RUNTIME_CONFIG__"]>;

function nonEmptyUrl(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

/** Apply absolute api_base_url only for split-host deploys; same-origin Hub keeps relative `/v1`. */
export function shouldApplyRuntimeApiBaseUrl(url: string | null | undefined): boolean {
  const api = nonEmptyUrl(url);
  if (!api) return false;
  if (typeof window === "undefined") return true;
  try {
    return new URL(api).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Merge API/runtime-config without letting null/empty URLs overwrite deploy inject. */
export function mergeRuntimeConfig(
  prev: RuntimeConfigSlice,
  next: Partial<RuntimeConfigSlice>,
): RuntimeConfigSlice {
  const api = nonEmptyUrl(next.api_base_url ?? next.apiBaseUrl);
  const realtime = nonEmptyUrl(next.realtime_base_url);
  const merged: RuntimeConfigSlice = {
    ...prev,
    ...(api ? { api_base_url: api, apiBaseUrl: api } : {}),
    ...(realtime ? { realtime_base_url: realtime } : {}),
    ...(nonEmptyUrl(next.environment) ? { environment: String(next.environment).trim() } : {}),
    ...(nonEmptyUrl(next.hub_default_route) ? { hub_default_route: String(next.hub_default_route).trim() } : {}),
    ...(next.features ? { features: { ...(prev.features ?? {}), ...next.features } } : {}),
    ...(next.observability
      ? { observability: { ...(prev.observability ?? {}), ...next.observability } }
      : {}),
  };
  return merged;
}

const OVERRIDE_STORAGE_KEY = "mlair.runtime-config.override";

export type RuntimeConfigOverride = {
  jaegerBaseUrl?: string;
  apiBaseUrl?: string;
};

export function readRuntimeConfigOverride(): RuntimeConfigOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeConfigOverride;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRuntimeConfigOverride(value: RuntimeConfigOverride | null): void {
  if (typeof window === "undefined") return;
  if (!value || (!value.jaegerBaseUrl?.trim() && !value.apiBaseUrl?.trim())) {
    localStorage.removeItem(OVERRIDE_STORAGE_KEY);
    return;
  }
  localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(value));
}

export function applyRuntimeConfigPatch(patch: RuntimeConfigOverride): void {
  if (typeof window === "undefined") return;
  const cur = window.__ML_AIR_RUNTIME_CONFIG__ ?? {};
  const jaeger = String(patch.jaegerBaseUrl || "").trim();
  const api = String(patch.apiBaseUrl || "").trim();
  window.__ML_AIR_RUNTIME_CONFIG__ = {
    ...cur,
    ...(jaeger
      ? {
          jaegerBaseUrl: jaeger,
          observability: { ...(cur.observability ?? {}), jaeger_ui_url: jaeger },
        }
      : {}),
    ...(api ? { apiBaseUrl: api, api_base_url: api } : {}),
  };
  window.dispatchEvent(new Event("mlair-runtime-config-updated"));
}

/** Apply browser-local overrides saved from Settings (session preview). */
export function hydrateRuntimeConfigOverride(): void {
  const saved = readRuntimeConfigOverride();
  if (saved) applyRuntimeConfigPatch(saved);
}

export function clearRuntimeConfigOverride(): void {
  writeRuntimeConfigOverride(null);
}

/** Deep link to a trace in Jaeger UI (supports v0-style `jaegerBaseUrl` and deploy `observability.jaeger_ui_url`). */
export function getJaegerTraceUrl(traceId: string): string | null {
  const config = getRuntimeConfig();
  const camel = config?.jaegerBaseUrl;
  const nested = config?.observability?.jaeger_ui_url;
  const raw = String(camel || nested || "").trim();
  if (!raw || !traceId) return null;
  const base = raw.replace(/\/$/, "");
  return `${base}/trace/${encodeURIComponent(traceId)}`;
}
