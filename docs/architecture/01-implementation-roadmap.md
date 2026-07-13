# Implementation roadmap (post architecture series)

**Purpose:** Track implementation after Packages **001–005** design freezes.  
**Note:** Product phase checklist may also live in local `ROADMAP.md` (gitignored).

---

## Completed

| Track | Status |
|-------|--------|
| 001 Identity implementation | Shipped + CI signoff |
| 002 Configuration Phases 0–5 | Closed |
| 003–005 Design freezes | Closed v1.0 |
| Operator sign-off automation | `verify_operator_signoff`, `signoff-local` |
| Execution / Deployment signoff | `verify_execution_signoff`, `verify_deployment_signoff` |
| Governance G2 semantic docs | Closed |
| Deployment D2 | Helm realtime, staging/production strict, External Secrets + WSS |
| Governance G3 | Replay env aliases removed; event stream L4/L1 audit |
| Execution E3+ | `verify_dlq_cancel_integration` |
| Operator tooling | `verify_alertmanager_routes`, `validate-scheduler-ha-quickstart`, `record_legacy_m1_snapshot` |
| **Phase 9 MVP** | `verify_phase9_signoff`, [06-phase9-formalization](./06-phase9-formalization.md) |

---

## In progress (operator)

| Phase | Work | Command / artifact |
|-------|------|-------------------|
| **Staging sign-off ticket** | Hub manual + 24–48h `scheduler=2` observe | [staging-prod-signoff](../runbooks/staging-prod-signoff.md) |
| **Legacy M1** | 28-day staging strict observation | `make record-legacy-m1-snapshot ARGS='--start-date YYYY-MM-DD'` |
| **Production** | WSS fill-in + Alertmanager deploy in cluster | [production-wss-ingress](../runbooks/production-wss-ingress.md) |

---

## Deferred (research)

| Phase | Work |
|-------|------|
| **Phase 9 full** | Mathematical proofs, symbolic lifecycle algebra — see [06-phase9-formalization](./06-phase9-formalization.md) § Deferred |

---

## Sign-off gates

```bash
make signoff-local
make verify-phase9-signoff
make validate-scheduler-ha-quickstart
make record-legacy-m1-snapshot ARGS='--start-date YYYY-MM-DD'
```

See [operator-signoff](../runbooks/operator-signoff.md).
