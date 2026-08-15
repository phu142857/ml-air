import { switchScopeContext, type BootstrapContextResponse } from "./api";

export type EffectiveScope = BootstrapContextResponse["effective_scope"];

export function parseApiErrorPayload(err: unknown): Record<string, unknown> | null {
  const raw = String((err as Error)?.message || err || "");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export function isMappingVersionStaleError(err: unknown): boolean {
  const payload = parseApiErrorPayload(err);
  if (!payload) return false;
  const detail = payload.detail;
  if (detail === "mapping_version_stale") return true;
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    const code = String((detail as Record<string, unknown>).code || "");
    if (code === "mapping_version_stale") return true;
  }
  return String(payload.message || "").includes("mapping_version_stale");
}

export type SwitchScopeParams = {
  token: string;
  tenant_id: string;
  project_id: string;
  expected_mapping_version?: number;
};

export type SwitchScopeCallbacks = {
  refreshBootstrap: (opts?: { withSpinner?: boolean }) => Promise<unknown>;
  getMappingVersion: () => number | undefined;
  /** Apply server effective scope immediately (before bootstrap reconcile). */
  onEffectiveScope?: (scope: EffectiveScope) => void;
};

/**
 * Switches workspace scope; on mapping_version_stale refreshes bootstrap once and retries.
 */
export async function switchScopeWithRetry(
  params: SwitchScopeParams,
  callbacks: SwitchScopeCallbacks,
  options?: { retried?: boolean }
): Promise<void> {
  try {
    const result = await switchScopeContext(params.token, {
      tenant_id: params.tenant_id,
      project_id: params.project_id,
      expected_mapping_version: params.expected_mapping_version ?? callbacks.getMappingVersion(),
    });
    callbacks.onEffectiveScope?.(result.effective_scope);
    await callbacks.refreshBootstrap({ withSpinner: false });
  } catch (err) {
    if (!options?.retried && isMappingVersionStaleError(err)) {
      await callbacks.refreshBootstrap({ withSpinner: true });
      return switchScopeWithRetry(
        {
          ...params,
          expected_mapping_version: callbacks.getMappingVersion(),
        },
        callbacks,
        { retried: true }
      );
    }
    throw err;
  }
}
