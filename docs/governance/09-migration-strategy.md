# Governance Migration Strategy

**Document ID:** `docs/governance/09-migration-strategy.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Phase G0 — Inventory (2026-07-13)

Mapped live code paths to L4/L5 after Configuration refactor Phases 0–5.

| Legacy env cluster | Target |
|--------------------|--------|
| `ML_AIR_TENANT_QUOTA_*` | L4 `governance.quota_defaults` + L5 `tenant_quotas` |
| `ML_AIR_WEBHOOK_ALLOWED_HOSTS` | L4 `governance.webhook_allowed_hosts` |
| `ML_AIR_PROMOTION_*` | L4 `governance.promotion_*` |
| `ML_AIR_REPLAY_REQUIRE_*` | Settings features + worker helpers |
| `ML_AIR_EVENT_STREAM*` | Settings features (scheduler publish) |

---

## Phase G1 — Worker Settings bridge (2026-07-13)

- `api/app/settings/worker.py` — policy reads for scheduler / executor / realtime
- Images include `api` + `mlair` on `PYTHONPATH`
- L1 tuning (tick seconds, materialization limits, realtime coalesce) **unchanged** in env

---

## Phase G2 — Semantic freeze (2026-07-13) ✅

- [02-promotion-and-approval.md](./02-promotion-and-approval.md) — approval matrix + L4 keys
- [03-manifest-and-lineage.md](./03-manifest-and-lineage.md) — replay gates + signing layers
- [04-dataset-policy.md](./04-dataset-policy.md) — readiness, retention, version pins
- [05-audit-model.md](./05-audit-model.md) — identity audit incl. `system_settings.patch`
- [DESIGN-FREEZE.md](./DESIGN-FREEZE.md) closed v1.0

---

## Phase G3 — Remove remaining env aliases (2026-07-13) ✅

Removed from `deploy/.env.infra.example` and quickstart scheduler compose (L4-first via `app.settings.worker`):

- `ML_AIR_REPLAY_REQUIRE_CHECKSUM`
- `ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST`

**Kept (L1 scheduler):** `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE`

Rollback: `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1` + restore env keys.

**Event stream audit:**

| Key | Layer | Notes |
|-----|-------|-------|
| `ML_AIR_EVENT_STREAM` | L4 `features.event_stream` | Not in infra example |
| `ML_AIR_EVENT_STREAM_GLOBAL_FANOUT` | L4 `features.event_stream_global_fanout` | Not in infra example |
| `ML_AIR_EVENT_STREAM_MAXLEN` | L1 | Operator tuning only; `app.settings.worker` + scheduler env |
| `ML_AIR_EVENT_STREAM_GLOBAL_MAXLEN` | L1 | Same |

API `event_stream_service` reads enable/fanout via worker bridge; maxlen stays L1 env.

---

## Definition of done (v1.0 freeze)

1. No governance policy in `.env.example`
2. Hub edits cover all operator-tunable L4 governance keys
3. Integration tests for promotion deny/allow paths per profile
4. Security review links Identity audit to `system_settings.patch`
