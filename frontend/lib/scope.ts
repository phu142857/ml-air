/** True when API calls need a concrete tenant + project (not aggregate "all"). */
export function isScopePinned(tenantId: string, projectId: string): boolean {
  return tenantId !== "all" && projectId !== "all"
}

export const SCOPE_PIN_HINT =
  "Select a specific tenant and project in the top bar. Aggregate “all” works for list pages only."
