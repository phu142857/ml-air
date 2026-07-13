# Operator sign-off — Wave 0 / 1, Identity, strict lifecycle

**Goal:** One index for automated gates and manual checklists when signing off staging or production.

---

## Quick commands

| Gate | Command |
|------|---------|
| **Automated bundle** (Identity + Wave 0) | `make verify-operator-signoff` |
| **+ strict lifecycle** (staging/prod) | `make verify-operator-signoff-strict` |
| Alertmanager tenant routes (static) | `make verify-alertmanager-routes` |
| Legacy M1 observation snapshot | `make record-legacy-m1-snapshot ARGS='--start-date YYYY-MM-DD'` |
| Sync L4 strict features only | `python scripts/sync_strict_lifecycle_l4.py` |
| **Full local sign-off** | `make signoff-local` (= strict bundle + `wave1` + scheduler HA) |
| Identity only | `make verify-identity` |
| Strict runtime-config only | `make verify-strict-lifecycle` |

Set `ML_AIR_BASE_URL` when the stack is not on `http://localhost:8080`.

---

## Staging strict env

Merge strict overlay before boot:

```bash
cat .env.example deploy/.env.infra.example deploy/env/staging-strict.env.example > .env
mlair rebuild
python scripts/sync_strict_lifecycle_l4.py   # if L4 was seeded before strict profile
make verify-operator-signoff-strict
```

Files:

- [`deploy/env/staging-strict.env.example`](../../deploy/env/staging-strict.env.example)
- [`deploy/env/production-strict.env.example`](../../deploy/env/production-strict.env.example)

Details: [production-strict-lifecycle](./production-strict-lifecycle.md)

---

## Execution order (staging)

1. `make verify-operator-signoff-strict` — automated
2. Hub manual checklist — [staging-prod-signoff](./staging-prod-signoff.md) § Hub manual
3. `make wave1` — Prometheus rules + chaos drill
4. `make validate-scheduler-ha` — multi-replica scheduler
5. Fill ticket — [signoff-record-template](../operations/signoff-record-template.md)

Full detail: [signoff-wave0-wave1-phase9](./signoff-wave0-wave1-phase9.md) · [staging-prod-signoff](./staging-prod-signoff.md)

---

## Identity

| Step | Command |
|------|---------|
| Static + runtime-config | `python scripts/verify_identity_signoff.py` |
| Live login / L4 read | `python scripts/verify_identity_e2e.py` |

Included in `verify_operator_signoff.py`. Runbook: [identity-signoff](./identity-signoff.md)

---

## All-in-one vs quickstart

Default `mlair start` uses **all-in-one** (`deploy/docker-compose.allinone.yml`):

- Wave 0 / identity / strict automated gates work on `:8080` (nginx entrypoint).
- `make wave1` chaos drill works after Wave 0 fixes.
- `make validate-scheduler-ha` runs **Redis tick-lock only** inside the `mlair` container.
  For full `scheduler=2` sign-off use microservices:

```bash
COMPOSE_FILE=deploy/docker-compose.quickstart.yml mlair rebuild
make validate-scheduler-ha-quickstart
# equivalent:
# COMPOSE_FILE=deploy/docker-compose.quickstart.yml make validate-scheduler-ha
```

---

## What stays manual

- Hub UI checks (runs, WS 101, train with pinned version)
- Production **WSS** URL — [production-wss-ingress](./production-wss-ingress.md)
- Alertmanager tenant routes
- 24–48h observation with `scheduler=2`

---

## Package sign-off scripts

| Package | Command |
|---------|---------|
| Phase 9 MVP | `make verify-phase9-signoff` |
| Operator bundle | `make verify-operator-signoff-strict` |
| Execution E3 | `make verify-execution-signoff` |
| Deployment D3 | `make verify-deployment-signoff` |
| **Full local** | `make signoff-local` |

---

## CI coverage

`quickstart-test` job: `verify_identity_signoff`, `verify_identity_e2e`, `verify_execution_realtime`, strict env file static check.

Strict `runtime-config` verify runs in **staging/prod** after applying strict env — not on default `development` profile CI stack.
