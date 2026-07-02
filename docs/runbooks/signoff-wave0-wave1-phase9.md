# Sign-off checklist: Wave 0, Wave 1, Phase 9

Copy sections into your change ticket. **Code in repo is shipped** for Wave 0/1 automation; items marked **operator** must be executed and ticked in **your** environment (staging → production).

References: [execution-realtime-ops](./execution-realtime-ops.md) · [wave1-production-maturity](./wave1-production-maturity.md) · [legacy-compat-sunset](./legacy-compat-sunset.md) · [production-strict-lifecycle](./production-strict-lifecycle.md) · [ROADMAP Phase 9](../../ROADMAP.md#phase-9--research--paper-grade-formalization)

---

## Wave 0 — Execution realtime (Phase 11)

**Goal:** Hub updates runs, DAG, and lists without F5; WS default on; polling fallback when WS is down.

### Automated (local / CI)

| Step | Command | Pass criteria |
| --- | --- | --- |
| Stack health | `make health` | API, postgres, redis, realtime `/healthz` OK |
| Wave 0 verify | `make verify-wave0` | `scripts/verify_execution_realtime.py` exit 0 |
| Combined | `make wave0` | health + verify-wave0 |

Optional env: `ML_AIR_BASE_URL`, `MLAIR_REALTIME_PORT`, `ML_AIR_TENANT_ID`, `ML_AIR_PROJECT_ID`, `ML_AIR_REALTIME_VERIFY_TOKEN` (default `viewer-token`).

### Configuration (per environment)

- [ ] **operator** `GET /v1/runtime-config` → `features.realtime_enabled` ≠ `false`
- [ ] **operator** `realtime_base_url` correct for browser (dev: `ws://localhost:8001`; prod: **`wss://…`** on your hostname)
- [ ] **operator** Realtime always on in current builds; set `ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://…` ([production-wss-ingress](./production-wss-ingress.md))
- [ ] **operator** Production ingress: fill [`production-wss-ingress.md`](./production-wss-ingress.md) table + set `ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://…`
- [ ] **operator** Hub token matches API auth (`ML_AIR_AUTH_TOKENS_JSON` / JWT)

### Manual Hub (≈2 min, pinned scope)

- [ ] **operator** **Runs** — active run status advances without refresh
- [ ] **operator** **Run detail → Execution graph** — task nodes track scheduler
- [ ] **operator** **Pipelines** — topology/DAG reflects recent execution
- [ ] **operator** DevTools → WS to `{realtime_base_url}/ws?tenant_id=…&project_id=…&token=…` — **101** or connected (not stuck pending)
- [ ] **operator** Stop `realtime` briefly — UI still drifts via polling; after restart WS reconnects

### Wave 0b — Version-centric readiness (recommended same ticket)

From [legacy-compat-sunset](./legacy-compat-sunset.md) pre-sunset / **M1 staging strict**:

- [ ] **operator** Staging uses [`deploy/env/staging-strict.env.example`](../../deploy/env/staging-strict.env.example) (or equivalent) — see [production-strict-lifecycle](./production-strict-lifecycle.md)
- [ ] **operator** `features.readiness_allow_legacy_fallback` is `false` in target env
- [ ] **operator** `features.strict_dataset_version_required` and `strict_dataset_version_all_post_runs` are `true` in staging/prod (unless ticketed pipeline exceptions)
- [ ] **operator** Train / Run / automation send `dataset_version_id` where required
- [ ] **operator** No unexplained sustained `422 DATASET_VERSION_REQUIRED` in API logs

### Sign-off record

| Field | Value |
| --- | --- |
| Environment | _staging / production_ |
| Hostname / release | _e.g. mlair.example.com @ git SHA_ |
| `make wave0` date + operator | _YYYY-MM-DD, name_ |
| Hub manual checklist | _pass / fail + notes_ |
| WSS URL documented | _yes / N/A dev-only_ |
| Ticket / approval ID | _…_ |

**ROADMAP flip (after above):** Phase 11 — staging/production sign-off + production WSS ingress documented.

---

## Wave 1 — Production maturity (Phase 12)

**Goal:** Tenant-scoped alerts, safe multi-replica scheduler ticks, realtime chaos drill.

### Automated

| Step | Command | Pass criteria |
| --- | --- | --- |
| Prometheus rules | `make test-prometheus-rules` | `promtool check rules` on `deploy/monitoring/alerts/mlair-alerts.yml` |
| Chaos drill | `make chaos-wave1` | Wave 0 → stop realtime → `--degraded` verify → restart → Wave 0 |
| Combined | `make wave1` | rules + chaos-wave1 |

CI without Docker realtime control: `CHAOS_SKIP_REALTIME_STOP=1 make chaos-wave1`.

### Tenant alerts

- [ ] **operator** Deploy includes group **`mlair-lifecycle-semantic-tenant`** ([`mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml))
- [ ] **operator** Grafana boards reachable: eligibility / materialization / governance (see [`view-metrics`](../guides/view-metrics.md))
- [ ] **operator** Sample query returns data: `sum by (tenant_id) (increase(mlair_eligibility_denied_total[15m]))`
- [ ] **operator** Alertmanager routes `*ByTenant` alerts — skeleton: [`alertmanager-tenant-routes.example.yml`](../../deploy/monitoring/alertmanager-tenant-routes.example.yml)

### Multi-replica scheduler (staging minimum)

```bash
make validate-scheduler-ha
# or: docker compose -f deploy/docker-compose.quickstart.yml up -d --scale scheduler=2
```

- [ ] **operator** `ML_AIR_SCHEDULER_TICK_LOCK=1` (default) on all scheduler replicas
- [ ] **operator** Trigger policy / materialization ticks fire **once** per interval (not N-fold storms)
- [ ] **operator** `mlair_scheduler_tick_lock_skipped_total` increases on non-leader replicas (expected)
- [ ] **operator** Run queue still consumed (`BLPOP mlair:runs:new` — one consumer per message)

### Sign-off record

| Field | Value |
| --- | --- |
| Environment | _staging / production_ |
| `make wave1` date + operator | _…_ |
| Alertmanager tenant routes applied | _yes / ticket #_ |
| `scheduler=2` staging validation | _date, observations_ |
| Chaos drill on staging | _pass / fail_ |
| Ticket / approval ID | _…_ |

**ROADMAP flip (after above):** Phase 12 — Alertmanager routes + staging `scheduler>1`.

---

## Phase 9 — Research / paper-grade formalization

**Important:** Phase 9 is **not** a production gate for Wave 0/1. Most items are **research backlog**. Sign-off here means agreeing what is **done in-repo** vs **deferred**.

### Shipped in repo (can sign “documentation / contract MVP”)

| Item | Evidence |
| --- | --- |
| Event flow diagrams (MVP) | [`docs/concepts/lifecycle-event-flow.md`](../concepts/lifecycle-event-flow.md) |
| Realtime envelope v1 | [`docs/api/realtime-event-envelope.md`](../api/realtime-event-envelope.md) |
| Semantic event JSON schema + validator | [`sdk/schemas/mlair-semantic-event-v1.schema.json`](../../sdk/schemas/mlair-semantic-event-v1.schema.json), `scripts/validate_semantic_event.py` |
| Canonical readiness reason codes | [`docs/api/readiness-and-gating.md`](../api/readiness-and-gating.md#canonical-readiness-reason-codes-global-contract-for-mlair) |
| Readiness / eligibility / gating API semantics | [`readiness-and-gating.md`](../api/readiness-and-gating.md), OpenAPI |

### Research backlog (do **not** block Wave 0/1)

- [ ] **deferred** Mathematical lifecycle entity model + invariants
- [ ] **deferred** Lifecycle algebra: δ(state, event), formal `readiness(·)`, `eligibility(·)`
- [ ] **deferred** Closed event set with preconditions / side effects / guarantees (beyond v1 envelope doc)
- [ ] **deferred** Formal proofs + semantic observability model paper
- [ ] **deferred** Additional architecture / state-machine diagrams beyond MVP

### Phase 9 sign-off (product / architecture)

Use this when closing a **research milestone**, not a deploy:

- [ ] **product** Accepts v1 semantic envelope + realtime/webhook docs as **operational contract**
- [ ] **product** Accepts canonical readiness codes as **global metric/API contract**
- [ ] **architecture** Tracks formal model work in a separate epic (not mixed with Wave 0/1 deploy tickets)
- [ ] **optional** Target date for formal model doc: _YYYY-MM-DD_

---

## One-page combined gate (staging → prod)

**Primary runbook:** [Staging → production sign-off](./staging-prod-signoff.md) — ticket template in [signoff-record-template](../operations/signoff-record-template.md).

Execute in order:

1. `make wave0` + `make verify-strict-lifecycle` + Hub manual checklist (Wave 0)
2. Legacy / version-centric pre-sunset items if cutting over readiness (Wave 0b)
3. `make wave1` on same stack
4. `make validate-scheduler-ha` on staging + observe 24–48h
5. Apply Alertmanager tenant routes in cluster
6. Repeat Wave 0 manual checklist on **production** with **WSS**
7. Fill **one change ticket per env** (date, operator, link this doc)
8. Record ticket IDs; flip ROADMAP Phase 17/19 operator checkboxes in release notes

Or locally: `make signoff-local` (wave0 + strict verify + wave1 + scheduler HA).

Phase 9: acknowledge MVP docs above; schedule formal work separately.
