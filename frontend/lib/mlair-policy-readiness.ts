import { fetchDatasetReadiness, type DatasetTrainingPolicy } from "@/lib/api";

export type MlairPolicyReadinessSnapshot = Awaited<ReturnType<typeof fetchDatasetReadiness>>;

export type MlairPolicyReadinessBlock =
  | { kind: "no_policy"; message: string }
  | { kind: "no_version"; message: string }
  | { kind: "not_eligible"; snapshot: MlairPolicyReadinessSnapshot; policyId: string }
  | { kind: "check_failed"; message: string };

export function resolvePolicyIdForTrain(
  policies: DatasetTrainingPolicy[],
  explicitPolicyId: string | undefined,
  modelId: string | undefined
): string | null {
  const explicit = String(explicitPolicyId || "").trim();
  if (explicit) return explicit;
  const mid = String(modelId || "").trim();
  if (mid) {
    const bound = policies.find((p) => String(p.model_id || "").trim() === mid);
    if (bound?.policy_id) return String(bound.policy_id);
  }
  const first = policies[0]?.policy_id;
  return first ? String(first) : null;
}

export async function assessMlairPolicyReadiness(args: {
  tenantId: string;
  projectId: string;
  datasetId: string;
  token: string;
  datasetVersionId: string | undefined;
  policies: DatasetTrainingPolicy[];
  policyId?: string;
  modelId?: string;
  requiredSize?: number;
}): Promise<{ ok: true; policyId: string; snapshot: MlairPolicyReadinessSnapshot } | { ok: false; block: MlairPolicyReadinessBlock }> {
  const policies = args.policies || [];
  if (!policies.length) {
    return {
      ok: false,
      block: {
        kind: "no_policy",
        message: "No training policy on this dataset. Create one under the Readiness tab before Run / Train.",
      },
    };
  }
  const versionId = String(args.datasetVersionId || "").trim();
  if (!versionId) {
    return {
      ok: false,
      block: {
        kind: "no_version",
        message: "Select a dataset version. MLAir training policy is evaluated per immutable version.",
      },
    };
  }
  const policyId = resolvePolicyIdForTrain(policies, args.policyId, args.modelId);
  if (!policyId) {
    return {
      ok: false,
      block: {
        kind: "no_policy",
        message: "No training policy selected. Choose a policy on the Readiness tab.",
      },
    };
  }
  try {
    const snapshot = await fetchDatasetReadiness(
      args.tenantId,
      args.projectId,
      args.datasetId,
      args.token,
      args.requiredSize ?? 1000,
      versionId,
      policyId
    );
    const ready = Boolean(snapshot.ready);
    const status = String(snapshot.eligibility_status || snapshot.status || "").toLowerCase();
    if (!ready || status === "blocked") {
      return { ok: false, block: { kind: "not_eligible", snapshot, policyId } };
    }
    return { ok: true, policyId, snapshot };
  } catch (err) {
    return {
      ok: false,
      block: {
        kind: "check_failed",
        message: String((err as Error)?.message || err || "Readiness check failed"),
      },
    };
  }
}

export function failingCriteriaFromSnapshot(snapshot: MlairPolicyReadinessSnapshot) {
  return (snapshot.eligibility_criteria || []).filter((c) => String(c.status || "").toLowerCase() === "fail");
}
