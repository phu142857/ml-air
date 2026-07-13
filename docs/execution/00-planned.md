# Execution Architecture — Design Package

**Series:** 003 Execution Architecture  
**Status:** **CLOSED v1.0** (2026-07-13)  
**Path:** `docs/execution/`

See [DESIGN-FREEZE.md](./DESIGN-FREEZE.md) for scope and [09-migration-strategy.md](./09-migration-strategy.md) for phases.

---

## Artifacts (frozen)

| Doc | Topic |
|-----|-------|
| [01-architecture-overview.md](./01-architecture-overview.md) | Components, modes, HA |
| [02-state-machines.md](./02-state-machines.md) | Run + task transitions |
| [03-lease-and-retry.md](./03-lease-and-retry.md) | Lease, backoff, DLQ |
| [04-plugin-runtime.md](./04-plugin-runtime.md) | Internal executor |
| [05-external-workers.md](./05-external-workers.md) | Pull worker contract |
| [08-contributor-rules.md](./08-contributor-rules.md) | PR gates, L1 inventory |
| [09-migration-strategy.md](./09-migration-strategy.md) | Phases E0–E3 |

---

## Dependencies (met)

- **002** Configuration — worker settings bridge
- **004** Governance — replay/manifest gates
- **001** Identity — SA auth for workers

**Next:** [005 Deployment](../deployment/DESIGN-FREEZE.md)

See [Platform Architecture Series](../architecture/00-platform-architecture-series.md).
