/**
 * Build-time / runtime flags from `NEXT_PUBLIC_*` env (client-safe).
 */

function falsyEnv(value: string | undefined): boolean {
  const v = String(value || "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/**
 * When enabled, the model detail page emphasizes governance and points training/readiness to Dataset hub,
 * with legacy on-page readiness + CSV tucked under a disclosure.
 *
 * Default: **on** (unset empty env). Set `NEXT_PUBLIC_MLAIR_MODEL_LIFECYCLE_HUB_UI=false` to restore the legacy layout.
 */
export function mlairFlagModelLifecycleHubUi(): boolean {
  if (typeof process === "undefined") return true;
  const raw = process.env.NEXT_PUBLIC_MLAIR_MODEL_LIFECYCLE_HUB_UI;
  if (raw === undefined || String(raw).trim() === "") return true;
  if (falsyEnv(raw)) return false;
  return true;
}
