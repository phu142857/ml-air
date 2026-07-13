# Deployment Architecture — Design Package

**Series:** 005 Deployment Architecture  
**Status:** **CLOSED v1.0** (2026-07-13)  
**Path:** `docs/deployment/`

See [DESIGN-FREEZE.md](./DESIGN-FREEZE.md) for scope and [09-migration-strategy.md](./09-migration-strategy.md) for phases.

---

## Artifacts (frozen)

| Doc | Topic |
|-----|-------|
| [01-architecture-overview.md](./01-architecture-overview.md) | Targets, observability |
| [02-compose-topologies.md](./02-compose-topologies.md) | Compose variants |
| [03-kubernetes-helm.md](./03-kubernetes-helm.md) | Baseline Helm chart |
| [04-ha-and-scaling.md](./04-ha-and-scaling.md) | HA + scaling |
| [05-backup-and-dr.md](./05-backup-and-dr.md) | Backup + DR |
| [09-migration-strategy.md](./09-migration-strategy.md) | Phases D0–D3 |

---

## Platform series complete

Packages **001–005** design freezes are closed. Ongoing work:

- Operator sign-off runbooks (Wave 0/1, identity, staging/prod strict)
- Post-freeze: Helm hardening, execution/deployment verify scripts

See [Platform Architecture Series](../architecture/00-platform-architecture-series.md).
