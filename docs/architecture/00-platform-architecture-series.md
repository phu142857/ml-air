# MLAir Platform Architecture Series

**Purpose:** Canonical architecture packages for an open-source MLOps control plane.  
**Language:** English (all series documents, ADRs, and Design Freeze gates).  
**Rule:** No feature implementation that expands configuration surface, execution semantics, governance policy, or deployment topology until the relevant package is **Design Freeze**.

---

## Series index

| # | Package | Path | Status |
|---|---------|------|--------|
| **001** | Identity Architecture | [`docs/iam/`](../iam/DESIGN-FREEZE.md) | **Design Freeze v1.0 — CLOSED** |
| **002** | Platform Configuration Architecture | [`docs/config/`](../config/DESIGN-FREEZE.md) | **Design Freeze v1.0 — CLOSED** (refactor Phases 0–5 ✅) |
| **003** | Execution Architecture | [`docs/execution/`](../execution/DESIGN-FREEZE.md) | **Design Freeze v1.0 — CLOSED** |
| **004** | Governance Architecture | [`docs/governance/`](../governance/DESIGN-FREEZE.md) | **Design Freeze v1.0 — CLOSED** |
| **005** | Deployment Architecture | [`docs/deployment/`](../deployment/DESIGN-FREEZE.md) | **Design Freeze v1.0 — CLOSED** |

Each package ships the same artifact classes:

| Artifact | Purpose |
|----------|---------|
| **Design Freeze** | Gate checklist; blocks implementation drift |
| **Architecture overview** | Canonical index and mental model |
| **Deep-dive docs** | Domain-specific freeze (layers, APIs, state machines, …) |
| **ADRs** | Durable decisions with alternatives rejected |
| **Migration strategy** | How to move from as-is without breaking the lab |
| **Contributor rules** | PR gates (no ad-hoc env vars, no raw `os.getenv`, …) |

---

## Recommended program order

```text
001 Identity Design Freeze          ✅ DONE
        │
        ▼
002 Configuration Design Freeze     ✅ DONE (refactor Phases 0–5)
        │
        ▼
001 Identity implementation         ✅ DONE (login-first Hub, SA bootstrap, CI gates)
        │
        ▼
004 Governance Design Freeze        ✅ DONE (v1.0)
        │
        ▼
003 Execution Design Freeze        ✅ DONE (v1.0)
        │
        ▼
005 Deployment Design Freeze        ✅ DONE (v1.0)
        │
        ▼
Post-freeze implementation        ✅ DONE (D2, G3, E3+, operator tooling, Phase 9 MVP)
        │
        ▼
Operator staging/prod tickets   ← CURRENT (manual + M1 observe)
```

**Why Configuration before Identity implementation:** Without a frozen configuration model, every Identity (and execution) PR adds env vars that must be refactored later. That refactor is now **closed**.

---

## Control-plane positioning

MLAir targets the operator experience of **MLflow** (minimal install config), **Argo Workflows** (controller defaults; few users edit ConfigMap), and **Kubernetes** (cluster vs namespace policy separation)—not a web application with hundreds of environment variables.

```text
L0  Constants                 compile-time; never exposed
L1  Internal defaults         code; safe defaults (lease, retry, TTL)
L2  Profile                   development | staging | production (bundled)
L3  Deployment contract       .env ~20 vars: infra, secrets, profile, image
L4  System runtime settings   DB + Hub System Settings (global admin)
L5  Tenant runtime settings   DB + APIs (tenant admin; IAM policies)
```

Identity login, JWT issuers, and core auth flows are **platform capabilities** (L0/L1 + L3 secrets)—not L4 feature toggles.

---

## ADR numbering

| Range | Topic |
|-------|--------|
| ADR-008 – 010 | Identity (accepted) |
| ADR-011 – 013 | Platform Configuration (draft) |
| ADR-014+ | Reserved for Execution, Governance, Deployment packages |

---

## Related

- [Implementation roadmap (post-freeze)](./01-implementation-roadmap.md)
- [Phase 9 formalization (MVP)](./06-phase9-formalization.md)
- [Identity Design Package v1.0](../iam/DESIGN-FREEZE.md)
- [Platform Configuration Architecture](../config/DESIGN-FREEZE.md)
- [Project configuration guide](../configuration.md) — operator-facing (will be aligned after Package 002 freeze)
