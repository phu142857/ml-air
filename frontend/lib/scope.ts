/** True when API calls need a concrete tenant + project (not aggregate "all"). */
export function isScopePinned(tenantId: string, projectId: string): boolean {
  return tenantId !== "all" && projectId !== "all"
}

/** @deprecated Use SCOPE_PIN_DEFAULT from @/lib/scope-messages */
export { SCOPE_PIN_DEFAULT as SCOPE_PIN_HINT } from "@/lib/scope-messages"
