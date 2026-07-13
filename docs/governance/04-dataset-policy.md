# Dataset Policy

**Document ID:** `docs/governance/04-dataset-policy.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Purpose

Dataset governance covers version pinning, readiness before training/runs, retention, and checksum validation—not storage URIs (L3).

**Code:** `readiness_service.py`, `dataset_retention_service.py`, dataset routes in `v1.py`.

---

## Version pinning (L4 features)

| Feature flag | Effect |
|--------------|--------|
| `strict_dataset_version_required` | Runs/pipelines must declare `dataset_version_id` where policy applies |
| `strict_dataset_version_all_post_runs` | Extends strict pin to post-run paths |
| `validate_dataset_version_checksum` | Reject checksum mismatch on declared versions |
| `require_declared_dataset_inputs` | Pipeline config must declare dataset inputs for readiness |
| `warn_implicit_dataset_head` | Warn when implicit latest head used (non-fatal) |

Configured in L4 `system_settings.features` or profile bundle; Hub **System** tab for global admin.

---

## Readiness

Training-policy readiness runs **before** run creation (Hub train / gated trigger):

1. Evaluate declared inputs against dataset catalog state.
2. Persist evaluations in `dataset_readiness_evaluations` (deduped).
3. Fail closed with `mlair_readiness_not_eligible` when not eligible.

| Flag | Behavior |
|------|----------|
| `readiness_allow_legacy_fallback` | Allow dataset-scoped readiness without explicit version pin (legacy lab) |
| `readiness_async_queue` | Async drain of readiness queue (worker interval L1) |

**Sign-off:** staging/prod should set `readiness_allow_legacy_fallback: false` via L4 or strict profile env.

---

## Retention (L5 per dataset)

| Layer | Mechanism |
|-------|-----------|
| L4 | `features.dataset_retention_policies` — feature on/off |
| L5 | `dataset_retention_policies` table per dataset — max versions, enabled flag |
| API | `GET/PUT .../datasets/{id}/retention-policy`, `POST .../retention/purge` |

Global default max versions for new policies: seeded in profile; not a separate env var in contract.

---

## Quotas (cross-link)

Dataset **count** per project is capped by L5 `tenant_quotas` + L4 `governance.quota_defaults`. See [tenant-quotas API](../api/tenant-quotas.md).

---

## Error model

| Situation | Typical response |
|-----------|------------------|
| Missing version pin | `422` / `DATASET_VERSION_REQUIRED` |
| Readiness failed | `409` / readiness canonical codes |
| Retention purge blocked | Policy disabled or plan empty |

---

## Non-goals (v1.0)

- Automated legal hold / litigation retention
- Cross-tenant dataset sharing policy
