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

const approvalPillBase =
  "inline-flex w-fit max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium";

/** Semantic pill classes — colors from `app/globals.css` CSS variables (light / .dark). */
export function modelApprovalPillClass(approvalStatus?: string): string {
  if (approvalStatus === "approved") {
    return `${approvalPillBase} border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]`;
  }
  if (approvalStatus === "rejected") {
    return `${approvalPillBase} border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] text-[color:var(--status-failed-fg)]`;
  }
  if (approvalStatus === "pending_manual_approval") {
    return `${approvalPillBase} border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]`;
  }
  return `${approvalPillBase} border-border bg-muted/40 text-muted-foreground`;
}

/** Human label for approval pill; pending returns null (actions only in UI). */
export function modelApprovalDisplayLabel(approvalStatus?: string): string | null {
  if (approvalStatus === "approved") return "Approved";
  if (approvalStatus === "rejected") return "Rejected";
  if (approvalStatus === "pending_manual_approval") return null;
  return approvalStatus?.trim() ? approvalStatus : null;
}

const stagePillBase = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs";

/** Stage badge colors: production green, staging yellow, archived/neutral plain. */
export function modelStagePillClass(stage?: string): string {
  const s = (stage || "").trim().toLowerCase();
  if (s === "production") {
    return `${stagePillBase} border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]`;
  }
  if (s === "staging") {
    return `${stagePillBase} border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]`;
  }
  return `${stagePillBase} border-border bg-muted/40 text-foreground`;
}

export function modelStageIndicator(stage?: string): "●" | "○" {
  return (stage || "").trim().toLowerCase() === "production" ? "●" : "○";
}
