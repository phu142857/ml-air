export type PromotionGovernanceFeatures = {
  promotion_governance_enabled?: boolean;
  promotion_approval_stages?: string[];
  promotion_stage_order?: string[];
  promotion_allow_skip_stages?: boolean;
  rollback_enabled?: boolean;
  rollback_requires_approval?: boolean;
};

function stageOrder(features: PromotionGovernanceFeatures | null | undefined): string[] {
  const fromCfg = features?.promotion_stage_order?.filter(Boolean);
  if (fromCfg?.length) return fromCfg.map((s) => s.trim().toLowerCase());
  return ["staging", "production"];
}

function normStage(stage?: string | null): string | null {
  const s = (stage || "").trim().toLowerCase();
  if (!s || s === "archived") return null;
  return s;
}

function stageIndex(stage: string | null, order: string[]): number | null {
  if (!stage) return null;
  const i = order.indexOf(stage);
  return i >= 0 ? i : null;
}

export function transitionKind(
  currentStage: string | undefined,
  targetStage: string,
  features: PromotionGovernanceFeatures | null | undefined
): "forward" | "rollback" | "noop" | "unknown" {
  const order = stageOrder(features);
  const target = (targetStage || "production").trim().toLowerCase();
  const current = normStage(currentStage);
  if (current === target) return "noop";
  const cr = stageIndex(current, order);
  const tr = stageIndex(target, order);
  if (tr === null) return "unknown";
  if (cr === null) return "forward";
  if (tr > cr) return "forward";
  if (tr < cr) return "rollback";
  return "unknown";
}

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
  const kind = transitionKind(row.stage, target, features);
  if (kind !== "forward") return false;

  const order = stageOrder(features);
  const current = normStage(row.stage);
  const cr = stageIndex(current, order);
  const tr = stageIndex(target, order);
  if (tr === null) return false;
  if (cr !== null) {
    if (features?.promotion_allow_skip_stages) {
      if (tr <= cr) return false;
    } else if (tr !== cr + 1) {
      return false;
    }
  } else if (tr !== 0 && !features?.promotion_allow_skip_stages) {
    return false;
  }

  if (!stageRequiresPromotionApproval(target, features)) return true;
  return row.approval_status === "approved";
}

export function canRollbackVersionToStage(
  row: { stage?: string; approval_status?: string },
  targetStage: string,
  features: PromotionGovernanceFeatures | null | undefined
): boolean {
  if (features?.rollback_enabled === false) return false;
  const target = (targetStage || "staging").trim().toLowerCase();
  const kind = transitionKind(row.stage, target, features);
  if (kind !== "rollback") return false;
  if (features?.rollback_requires_approval) {
    return row.approval_status === "approved";
  }
  return true;
}

export function promotionBlockMessage(
  row: { stage?: string; approval_status?: string },
  targetStage: string,
  features?: PromotionGovernanceFeatures | null
): string {
  const target = (targetStage || "production").trim().toLowerCase();
  const kind = transitionKind(row.stage, target, features);
  if (kind === "noop") return `Already at ${target}.`;
  if (kind === "unknown") return `Stage '${target}' is not in the promotion order.`;
  if (kind === "rollback" && features?.rollback_enabled === false) {
    return "Rollback is disabled for this environment.";
  }
  if (kind === "forward") {
    const order = stageOrder(features);
    const cr = stageIndex(normStage(row.stage), order);
    const tr = stageIndex(target, order);
    if (cr !== null && tr !== null && tr > cr + 1 && !features?.promotion_allow_skip_stages) {
      const next = order[cr + 1];
      return next ? `Promote to '${next}' first (multi-stage workflow).` : "Invalid forward transition.";
    }
  }
  if (row.approval_status === "rejected") {
    return `Cannot move to ${target}: approval was rejected.`;
  }
  if (row.approval_status === "pending_manual_approval") {
    return `Cannot move to ${target}: pending manual approval.`;
  }
  if (row.approval_status === "pending_reviewer") {
    return `Cannot move to ${target}: pending reviewer approval.`;
  }
  if (row.approval_status === "pending_approver") {
    return `Cannot move to ${target}: pending final approver.`;
  }
  if (kind === "rollback" && features?.rollback_requires_approval) {
    return `Rollback to ${target} requires approval.`;
  }
  return `Cannot move to ${target}: approval required.`;
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
  if (approvalStatus === "pending_reviewer" || approvalStatus === "pending_approver") {
    return `${approvalPillBase} border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]`;
  }
  return `${approvalPillBase} border-border bg-muted/40 text-muted-foreground`;
}

/** Human label for approval pill; pending returns null (actions only in UI). */
export function modelApprovalDisplayLabel(approvalStatus?: string): string | null {
  if (approvalStatus === "approved") return "Approved";
  if (approvalStatus === "rejected") return "Rejected";
  if (approvalStatus === "pending_manual_approval") return null;
  if (approvalStatus === "pending_reviewer") return "Pending reviewer";
  if (approvalStatus === "pending_approver") return "Pending approver";
  return approvalStatus?.trim() ? approvalStatus : null;
}

export function isPendingApprovalStatus(status?: string): boolean {
  return (
    status === "pending_manual_approval" ||
    status === "pending_reviewer" ||
    status === "pending_approver"
  );
}

export function primaryApprovalAction(
  status?: string,
): { label: string; nextStatus: "pending_approver" | "approved" } | null {
  if (status === "pending_reviewer" || status === "pending_manual_approval") {
    return { label: "Submit review", nextStatus: "pending_approver" };
  }
  if (status === "pending_approver") {
    return { label: "Approve", nextStatus: "approved" };
  }
  return null;
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
  if (s === "dev") {
    return `${stagePillBase} border-border bg-muted/50 text-foreground`;
  }
  return `${stagePillBase} border-border bg-muted/40 text-foreground`;
}

export function modelStageIndicator(stage?: string): "●" | "○" {
  return (stage || "").trim().toLowerCase() === "production" ? "●" : "○";
}

/** Next forward stage in the configured order, if any. */
export function nextPromotionStage(
  currentStage: string | undefined,
  features: PromotionGovernanceFeatures | null | undefined
): string | null {
  const order = stageOrder(features);
  const cr = stageIndex(normStage(currentStage), order);
  if (cr === null) return order[0] ?? null;
  return order[cr + 1] ?? null;
}

/** Previous stage for rollback, if any. */
export function previousPromotionStage(
  currentStage: string | undefined,
  features: PromotionGovernanceFeatures | null | undefined
): string | null {
  const order = stageOrder(features);
  const cr = stageIndex(normStage(currentStage), order);
  if (cr === null || cr <= 0) return null;
  return order[cr - 1] ?? null;
}
