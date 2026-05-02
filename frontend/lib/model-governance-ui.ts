/** Semantic pill classes — colors from `app/globals.css` CSS variables (light / .dark). */
export function modelApprovalPillClass(approvalStatus?: string): string {
  const base = "approval-pill";
  if (approvalStatus === "approved") return `${base} approval-pill--success`;
  if (approvalStatus === "rejected") return `${base} approval-pill--danger`;
  if (approvalStatus === "pending_manual_approval") return `${base} approval-pill--warning`;
  return `${base} approval-pill--neutral`;
}
