# MLAir sign-off record (copy into change ticket)

## Wave 0 — Execution realtime

| Field | Value |
| --- | --- |
| Environment | staging / production |
| Release (git SHA / image tag) | |
| Hub URL | |
| `ML_AIR_RUNTIME_REALTIME_BASE_URL` | |
| `make wave0` (date, operator, pass/fail) | |
| Hub manual checklist ([runbook](../runbooks/execution-realtime-ops.md)) | pass / fail |
| WSS ingress doc ([production-wss-ingress](../runbooks/production-wss-ingress.md)) | link / N/A dev-only |
| Approver | |

## Wave 1 — Production maturity

| Field | Value |
| --- | --- |
| `make wave1` / `make test-prometheus-rules` | |
| `make chaos-wave1` on staging | |
| Alertmanager tenant routes applied | yes / ticket # |
| Scheduler replicas | _e.g. 2 on staging_ |
| `make validate-scheduler-ha` | |
| Observations (no duplicate triggers) | |
| Approver | |

## Phase 9 — Formal model (doc MVP)

| Field | Value |
| --- | --- |
| Reviewed [`lifecycle-formal-model`](../concepts/lifecycle-formal-model.md) | |
| Formal proofs / paper | deferred / ticket # |
