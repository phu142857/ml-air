# Governance Architecture — Design Package v1.0

**Series:** 004 Governance Architecture  
**Status:** **CLOSED** (v1.0 — 2026-07-13)  
**Depends on:** [002 Configuration](../config/DESIGN-FREEZE.md) · [001 Identity](../iam/DESIGN-FREEZE.md)

---

## Purpose

Unify scattered governance behavior (promotion, manifest, quotas, webhooks, dataset policy) under one documented model. Package 002 fixed **where** policy lives (L4 system vs L5 tenant); Package 004 defines **semantic rules** and migration from legacy env flags.

---

## Scope (v1.0)

| Domain | L4 (platform) | L5 (tenant) | Code anchor |
|--------|---------------|-------------|-------------|
| Promotion | `governance.promotion_*` | — (future overrides) | `promotion_policy.py`, `model_registry_service.py` |
| Manifest / replay | `features.*`, replay gates | — | `worker.py`, scheduler / executor |
| Quotas | `governance.quota_defaults`, `features.tenant_quota_enforce` | `tenant_quotas` table | `tenant_quota_service.py` |
| Webhooks | `governance.webhook_allowed_hosts` | `tenant_quotas.webhook_allowed_hosts` | `semantic_webhook_subscription_service.py` |
| Dataset readiness | `features.strict_dataset_*`, retention flag | `dataset_retention_policies` | `readiness_service.py`, `dataset_retention_service.py` |
| Audit | `system_settings.patch` | — | `identity_repository`, `system_settings_service` |

**Non-goals (v1.0):** new state machines, Helm policy, execution semantics changes, unified SIEM export.

---

## Artifacts

| Doc | Status |
|-----|--------|
| [01-architecture-overview.md](./01-architecture-overview.md) | Frozen v1.0 |
| [02-promotion-and-approval.md](./02-promotion-and-approval.md) | Frozen v1.0 |
| [03-manifest-and-lineage.md](./03-manifest-and-lineage.md) | Frozen v1.0 |
| [04-dataset-policy.md](./04-dataset-policy.md) | Frozen v1.0 |
| [05-audit-model.md](./05-audit-model.md) | Frozen v1.0 |
| [09-migration-strategy.md](./09-migration-strategy.md) | Frozen v1.0 |

---

## Entry criteria (v1.0) — met

- [x] Promotion approval matrix documented; profile vs L4 override guidance in [02](./02-promotion-and-approval.md)
- [x] Manifest strict lifecycle and replay gates per environment class in [03](./03-manifest-and-lineage.md)
- [x] Tenant quota + webhook L4/L5 split shipped (Config Phase 5) and documented in [01](./01-architecture-overview.md)
- [x] Identity audit on governance mutations (`system_settings.patch`) in [05](./05-audit-model.md)

---

## Post-freeze work (not blocking v1.0)

- **G3:** Remove redundant replay/event env aliases from infra example after operator sign-off
- Align `staging`/`production` profile YAML with strict approval defaults (code change, separate PR)
- Package **003** Execution design freeze

---

*Frozen v1.0. Material changes require ADR + version bump.*
