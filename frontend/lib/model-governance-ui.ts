export type PromotionGovernanceFeatures = {
  promotion_governance_enabled?: boolean;
  promotion_approval_stages?: string[];
};

export function stageRequiresPromotionApproval(
  targetStage: string,
  features: PromotionGovernanceFeatures | null | undefined
): boolean {
  if (!features?.promotion_governance_enabled) return false;
  const stages = features.promotion_approval_stages?.length
    ? features.promotion_approval_stages
    : ["production"];
  return stages.includes((targetStage || "").trim().toLowerCase());
}

export function canPromoteVersionToStage(
  row: { stage?: string; approval_status?: string },
  targetStage: string,
  features: PromotionGovernanceFeatures | null | undefined
): boolean {
  const target = (targetStage || "production").trim().toLowerCase();
  if ((row.stage || "").trim().toLowerCase() === target) return false;
  if (!stageRequiresPromotionApproval(target, features)) return true;
  return row.approval_status === "approved";
}

export function promotionBlockMessage(
  row: { approval_status?: string },
  targetStage: string
): string {
  const target = (targetStage || "production").trim().toLowerCase();
  if (row.approval_status === "rejected") {
    return `Cannot promote to ${target}: approval was rejected.`;
  }
  if (row.approval_status === "pending_manual_approval") {
    return `Cannot promote to ${target}: pending manual approval.`;
  }
  return `Cannot promote to ${target}: approval required.`;
}

/** Semantic pill classes — colors from `app/globals.css` CSS variables (light / .dark). */
export function modelApprovalPillClass(approvalStatus?: string): string {
  const base = "approval-pill";
  if (approvalStatus === "approved") return `${base} approval-pill--success`;
  if (approvalStatus === "rejected") return `${base} approval-pill--danger`;
  if (approvalStatus === "pending_manual_approval") return `${base} approval-pill--warning`;
  return `${base} approval-pill--neutral`;
}
