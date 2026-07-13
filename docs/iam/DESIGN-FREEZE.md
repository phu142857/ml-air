# Identity Design Package v1.0

**Status:** **CLOSED / Approved** (2026-07-13)  
**Scope:** MLAir IAM — design + migration strategy (no feature code in this package)

This package is **complete**. Do **not** extend architecture or cutover strategy by editing frozen docs. Material changes require a **new ADR**.

Canonical index: [01-architecture-overview.md](./01-architecture-overview.md)

---

## Stack (one responsibility each)

```text
Architecture → Domain → Logical Database → REST → UI
        → Capability → Permission → AuthZ Matrix → Error Model
        → Migration Plan (Design → Implementation bridge)
```

| ID | Document | Status |
|----|----------|--------|
| P0 | `00-current-authentication-analysis.md` | Approved |
| P1 | `02-target-identity-architecture.md` (+ lifecycle) | Architecture Freeze v1.0 |
| P2 | `03-domain-model.md` | Domain Freeze v1.0 |
| P3 | `04-logical-database.md` | Database Freeze v1.0 |
| P4 | `05-rest-api-specification.md` | API Freeze v1.0 |
| P5 | `06-ui-flow-wireframe.md` | UI Freeze v1.0 |
| — | `07-human-role-capabilities.md` | Approved |
| — | `08-service-account-permission-catalog.md` | Approved |
| — | `09-authorization-matrix.md` | Approved |
| — | `10-error-model.md` | Approved |
| P11 | `11-migration-plan.md` | **Approved** (incl. Implementation Order + DoD) |
| ADR-008 | Role Assignment | Accepted |
| ADR-009 | Service Account | Accepted |
| ADR-010 | Refresh Session | Accepted |

---

## Post-MVP (not in package — track via ADR later)

- SA read permissions (`models:read`, `datasets:read`, `runs:read`) for inference workers  
- `DUPLICATE_SERVICE_ACCOUNT_NAME` if SA names become unique per tenant  
- Split AuthZ matrix (`09A` Identity / `09B` Pipeline / …) when product surface grows  

---

## Implementation phase (gated)

```text
002 Configuration Design Freeze     ✅ CLOSED
        ↓
001 Identity implementation         ✅ shipped (Phases A–F; CI verify_identity_*)
        ↓
002 Configuration refactor          ✅ CLOSED
        ↓
004 Governance draft v0.1
```

Follow **Implementation Order** and **Definition of Done** in `11-migration-plan.md`.

**Configuration gate:** [Package 002 Design Freeze](../config/DESIGN-FREEZE.md) is **CLOSED**. New `ML_AIR_*` env vars must comply with [deployment contract](../config/07-deployment-contract.md) groups A–E only.

**No new design documents** unless an ADR opens a new design slice.
