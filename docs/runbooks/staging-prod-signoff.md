# Runbook: Staging → production sign-off (Lifecycle OS)

## Goal

MLAir as **Lifecycle OS** must survive **production**, not only local compose: HA scheduler, **WSS** realtime, tenant-scoped alerts, chaos drill executed, and a **single change ticket** per environment with Wave 0/1 evidence.

**Cost / chargeback** is **optional** — usage is recorded (`task_usage` / `run_usage`); dollar pricing adapter is **future work** and does **not** block this sign-off.

---

## Required vs optional

| Item | Staging | Production | Notes |
| --- | --- | --- | --- |
| `mlair health` + `verify_execution_realtime.py` (automated PASS) | **Required** | **Required** | health + realtime verify |
| Hub manual (runs, WS, polling fallback) | **Required** | **Required** | ~2 min, pinned scope |
| `python scripts/verify_strict_lifecycle.py` | **Required** | **Required** | strict `runtime-config.features` |
| `make wave1` / `make chaos-wave1` | **Recommended** | **Recommended** | chaos on staging minimum |
| `make validate-scheduler-ha` | **Required** | **Required** before multi-replica prod |
| WSS ingress + `ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://…` | N/A (ws OK) | **Required** | [production-wss-ingress](./production-wss-ingress.md) |
| Alertmanager tenant routes | If multi-tenant | **Required** if multi-tenant | [alertmanager-tenant-routes.example.yml](../../deploy/monitoring/alertmanager-tenant-routes.example.yml) |
| Strict lifecycle env | **Required** | **Required** | [production-strict-lifecycle](./production-strict-lifecycle.md) |
| Cost / billing adapter | Optional | Optional | [usage-attribution](../guides/usage-attribution.md) — no dollar API |

---

## One change ticket per environment

Copy [`signoff-record-template.md`](../operations/signoff-record-template.md) into your ticket (Jira/Linear/etc.). Title example:

**`MLAir staging sign-off — Wave 0/1 + strict lifecycle`**

**`MLAir production sign-off — WSS + Wave 0/1`**

Link this runbook and [`signoff-wave0-wave1-phase9.md`](./signoff-wave0-wave1-phase9.md).

---

## Execution order (staging)

Run from a machine that can reach the stack (set `ML_AIR_BASE_URL` if not `http://localhost:8080`):

```bash
cd /path/to/ml-air

# 1 — Automated Wave 0
mlair health
python scripts/verify_execution_realtime.py
python scripts/verify_strict_lifecycle.py

# 2 — Hub manual (~2 min) — see checklist below

# 3 — Wave 1 + chaos
make wave1

# 4 — Scheduler HA (staging multi-replica)
make validate-scheduler-ha

# 5 — Optional local bundle (steps 1 + 3 + 4)
make signoff-local
```

**Pass criteria:** all commands exit **0**; Hub manual items ticked; ticket record filled with **date + operator name**.

Observe staging with **`scheduler=2`** for **24–48h** before prod cutover (no duplicate materialization/trigger storms).

---

## Execution order (production)

After staging sign-off:

1. Apply prod env: [`deploy/env/production-strict.env.example`](../../deploy/env/production-strict.env.example)
2. Fill WSS table in [production-wss-ingress](./production-wss-ingress.md) — set `ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://…`
3. Deploy Alertmanager routes if multi-tenant
4. `mlair health` and `python scripts/verify_execution_realtime.py` against prod API URL (`ML_AIR_BASE_URL=https://…`)
5. `python scripts/verify_strict_lifecycle.py`
6. **Hub manual on prod** with **HTTPS** — DevTools WS must show **101** on **wss://**
7. Confirm **Runs list + run detail** update without F5 when a run completes

---

## Hub manual checklist (operator)

Pin tenant + project in Hub header (not aggregate `all`).

- [ ] **Runs** — active run status advances without refresh (list + detail)
- [ ] **Run detail → Execution graph** — task nodes track scheduler
- [ ] **Pipelines** — topology reflects recent execution (maintainer nav)
- [ ] DevTools → **WS** `{realtime_base_url}/ws?tenant_id=…&project_id=…&token=…` — **101** or connected
- [ ] Stop **realtime** briefly (staging drill) — UI still updates via polling; WS reconnects after restart
- [ ] **Dataset Hub → Run / Train** — train with pinned `dataset_version_id`; one Hub **`run_id`** end-to-end

---

## Ticket record (fill per env)

| Field | Staging | Production |
| --- | --- | --- |
| Hostname / release (git SHA) | | |
| Hub URL | | |
| `ML_AIR_RUNTIME_REALTIME_BASE_URL` | _ws://… or N/A_ | _wss://…_ |
| Wave 0 automated — date, operator, PASS/FAIL | | |
| `verify_strict_lifecycle.py` — PASS/FAIL | | |
| Hub manual — PASS/FAIL + notes | | |
| `make wave1` / chaos — PASS/FAIL | | |
| `validate-scheduler-ha` — date, observations | | |
| Alertmanager tenant routes — applied (Y/N, ticket #) | | |
| Strict env source (file / secret) | | |
| Approver / change ticket ID | | |

---

## Done criteria (“Xong khi”)

- [ ] **One filled change ticket** per staging and per production with links to this runbook + Wave 0/1 checklist
- [ ] Prod Hub realtime over **WSS** — run status updates without F5
- [ ] Staging **`validate-scheduler-ha`** passed before prod scales scheduler > 1
- [ ] (Optional) Paper/roadmap states: **usage recorded; pricing adapter = future work** — no dollar chargeback API required

---

## Optional: cost attribution (does not block sign-off)

MLAir already persists **resource accountability**:

- Tables: `task_usage`, `run_usage`, `task_usage_samples`
- Hub: run detail + task detail usage panels
- API: `GET .../tasks/{task_id}/usage`, run usage bundle

**Not shipped:** billing tags, dollar rates, chargeback export. Paper may state *“resource usage recorded for traceability; monetary chargeback out of scope.”*

Future adapter sketch (optional epic):

```
task_usage (tenant_id, project_id, run_id, task_id, cpu_seconds, gpu_seconds, …)
  → export job → billing system tags (no in-repo dollar API)
```

See [usage-attribution](../guides/usage-attribution.md) and [resource-usage-contract-v1](../guides/resource-usage-contract-v1.md).

---

## References

- [Sign-off Wave 0 / 1 / Phase 9](./signoff-wave0-wave1-phase9.md) — detailed sub-checklists
- [Sign-off record template](../operations/signoff-record-template.md)
- [Execution realtime ops](./execution-realtime-ops.md)
- [Wave 1 production maturity](./wave1-production-maturity.md)
- [Production WSS ingress](./production-wss-ingress.md)
- [Production strict lifecycle](./production-strict-lifecycle.md)
