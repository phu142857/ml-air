# Paper / abstract framing (MLAir positioning)

Use **one** story everywhere (README, abstract, intro, Hub copy). Clinic-scoped evaluations; **MLAir** branding; no vague “enterprise platform” claims.

---

## One sentence (abstract lead)

> **MLAir is a governance-centric lifecycle control plane** that binds immutable dataset versions, policy-backed readiness, gated training runs, and model promotion under a **single auditable `run_id`** — with pipelines as an internal execution substrate, not the user-facing product.

---

## Do say

- Lifecycle OS / lifecycle control plane
- Version-centric training anchor (`dataset_version_id`)
- Readiness, eligibility, execution gate (glossary terms)
- Clinic integrator (Vet-AI) and production-like run (YOLO `c55adc33`) via **MLAir API + Hub**
- E2 (Airflow + MLflow) as **comparison baseline** for ablation tables — label figures **“comparison baseline (not MLAir deployment)”**
- Resource usage recorded; **no dollar chargeback** in scope

---

## Do not say

- “Mini Airflow + MLflow” or “unified orchestration and tracking platform” without lifecycle pin/governance
- “Enterprise MLOps suite” / “single pane of glass for all tools”
- Scheduler UX superiority vs Airflow
- Vet-AI or YOLO as “deployed on Airflow then synced to MLAir”
- Implicit “latest dataset” as reproducible training (strict prod forbids this)

---

## Abstract skeleton (≈150 words)

1. **Problem:** mutable data heads, fragmented run identity, weak promote audit.
2. **Approach:** MLAir lifecycle chain (pin → readiness → eligibility → gate → run → model).
3. **Implementation:** multi-tenant API, Hub, plugins; strict version policy; semantic events.
4. **Evaluation:** Vet-AI clinic path + YOLO AWS lifecycle-train run; E2 baseline for comparison only.
5. **Limitations:** usage not billing; formal proofs deferred.

---

## Alignment checklist (before submit)

- [ ] Abstract opening matches README first paragraph (same “lifecycle OS” frame)
- [ ] Figure captions distinguish **MLAir path** vs **E2 baseline**
- [ ] Glossary terms match [readiness-and-gating](../api/readiness-and-gating.md)
- [ ] No operator glue steps (`dag_run_id` mapping) in methodology
- [ ] One-pager consistent: [MLAIR-one-pager.md](../MLAIR-one-pager.md)
