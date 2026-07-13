# Platform Configuration Architecture — Design Package v1.0

**Document ID:** `docs/config/DESIGN-FREEZE.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** **CLOSED / Approved** (2026-07-13)  
**Depends on:** [001 Identity Design Freeze](../iam/DESIGN-FREEZE.md) (closed)

This package defines **how MLAir is configured** as a control plane: layers, deployment contract, profiles, system vs tenant settings, and contributor rules. It does **not** implement code.

**Unblocked:** Identity implementation env cleanup (L3 contract only) and Configuration refactor per [09-migration-strategy.md](./09-migration-strategy.md).

---

## Stack (one responsibility each)

```text
Philosophy → Layers → System Settings → Tenant Settings
        → Profiles → Secrets → Deployment Contract
        → Migration Strategy → Contributor Rules
```

| ID | Document | Status |
|----|----------|--------|
| — | `01-architecture-overview.md` | Frozen v1.0 |
| — | `02-configuration-layers.md` | Frozen v1.0 |
| — | `03-system-runtime-settings.md` | Frozen v1.0 |
| — | `04-tenant-runtime-settings.md` | Frozen v1.0 |
| — | `05-profiles.md` | Frozen v1.0 |
| — | `06-secret-management.md` | Frozen v1.0 |
| — | `07-deployment-contract.md` | Frozen v1.0 |
| — | `08-contributor-rules.md` | Frozen v1.0 |
| — | `09-migration-strategy.md` | Frozen v1.0 |
| ADR-011 | Platform configuration philosophy | Accepted |
| ADR-012 | System runtime settings model | Accepted |
| ADR-013 | Deployment contract and secrets | Accepted |

---

## Freeze checklist (gate)

- [x] Layer model L0–L5 accepted (L4 ≠ L5)
- [x] Identity is platform core—not an L4 feature toggle
- [x] `.env` deployment contract capped (~20 vars, groups A–E) — **target**; as-is shrink in refactor Phase 3
- [x] Profile is the primary deployment-mode knob (`MLAIR_PROFILE`)
- [x] System vs tenant settings API boundaries defined
- [x] Contributor rules: no ad-hoc `os.getenv` in new code (after refactor baseline)
- [x] Migration strategy from ~190-var `.env.example` accepted
- [x] ADR-011 – 013 accepted

**Approved 2026-07-13.** Phases 0–5 complete (L4-first policy, L5 tenant consolidation, Hub PATCH UI, worker Settings bridge). Env alias rollback: `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1`.

---

## Explicit non-goals (this package)

- Execution state machine (Package 003)
- Promotion / manifest policy semantics (Package 004)
- Helm / HA / DR topology (Package 005)
- Renaming existing env vars (separate migration; aliases only)

---

## Implementation phase

```text
002 Configuration Design Freeze     ✅ CLOSED
        ↓
001 Identity implementation         ✅ shipped (CI: verify_identity_* + container tests)
        ↓
002 Configuration refactor          ✅ CLOSED (Phases 0–5)
        ↓
004 Governance Architecture         draft v0.1 (docs/governance/)
        ↓
003–005 Design packages             (Execution, Deployment — not started)
```

Material changes after freeze require a **new ADR** (ADR-014+).
