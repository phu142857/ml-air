# MLAir sign-off record (copy into change ticket)

**Runbook:** [Staging → production sign-off](../runbooks/staging-prod-signoff.md)

---

## Change ticket header

| Field | Value |
| --- | --- |
| Ticket title | _MLAir staging/prod sign-off — Wave 0/1_ |
| Environment | **staging** / **production** |
| Target date | |
| Operator | |
| Approver | |

---

## Automated gates

| Step | Command | Date | Operator | PASS / FAIL | Notes |
| --- | --- | --- | --- | --- | --- |
| Stack health + Wave 0 | `make wave0` | | | | |
| Strict lifecycle config | `python scripts/verify_strict_lifecycle.py` | | | | |
| Wave 1 + chaos | `make wave1` | | | | |
| Scheduler HA | `make validate-scheduler-ha` | | | | _staging before prod HA_ |
| Prometheus rules only | `make test-prometheus-rules` | | | | _optional if wave1 skipped_ |

Env vars used: `ML_AIR_BASE_URL=`, `ML_AIR_TENANT_ID=default`, `ML_AIR_PROJECT_ID=default_project`

---

## Configuration

| Field | Value |
| --- | --- |
| Release (git SHA / image tag) | |
| Hub URL | |
| API URL | |
| `ML_AIR_RUNTIME_REALTIME_BASE_URL` | _dev/staging: `ws://…` · prod: **`wss://…`**_ |
| WSS ingress doc filled | [production-wss-ingress](../runbooks/production-wss-ingress.md) — link / N/A |
| Strict env file | _e.g. `deploy/env/staging-strict.env.example`_ |
| Alertmanager tenant routes | yes / no — ticket # |
| Scheduler replicas observed | _e.g. 2 on staging, 24–48h_ |

---

## Hub manual checklist

| Check | PASS / FAIL | Notes |
| --- | --- | --- |
| Runs list status live (no F5) | | |
| Run detail + execution graph | | |
| Pipelines / DAG observability | | |
| DevTools WS **101** / connected | | |
| Realtime outage → polling fallback | | _staging chaos_ |
| Train with pinned `dataset_version_id` | | |

---

## Wave 0b — Strict lifecycle (Phase 18)

| Check | PASS / FAIL |
| --- | --- |
| `readiness_allow_legacy_fallback` = false | |
| `strict_dataset_version_required` = true | |
| `strict_dataset_version_all_post_runs` = true | |
| No sustained unexplained `422 DATASET_VERSION_REQUIRED` | |

---

## Optional — cost attribution (not a gate)

| Field | Value |
| --- | --- |
| Usage tracking enabled (`ML_AIR_USAGE_TRACKING_ENABLED`) | |
| Sample run/task with usage visible in Hub | |
| Dollar / chargeback adapter | **deferred** — usage recorded only |

---

## Approval

| Role | Name | Date | Signature / ticket link |
| --- | --- | --- | --- |
| Operator | | | |
| Platform / SRE | | | |
| Product (if prod) | | | |

**ROADMAP:** Phase 17 operator sign-off + Phase 19 staging/prod ticket filled.
