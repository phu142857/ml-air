# ADR-011: Platform Configuration Philosophy

**Status:** Accepted  
**Date:** 2026-07-13  
**Series:** 002 Platform Configuration Architecture  
**Deciders:** Platform architecture  
**Depends on:** ADR-008–010 (Identity)

---

## Context

MLAir’s `.env.example` has grown to ~190 variables, mixing infrastructure, secrets, feature flags, scheduler tuning, and tenant-relevant policy. This contradicts the control-plane goal: **minimal install config** (MLflow, Argo, Kubernetes patterns) with **mutable policy in the platform** (GitHub Enterprise Settings pattern).

Identity Package 001 is frozen. Implementation was adding more env vars (IAM secrets, lockout, feature flags), risking another refactor cycle.

We need a durable layer model before further implementation.

---

## Decision

Adopt a **six-layer configuration model**:

```text
L0  Constants              — compile-time
L1  Internal defaults      — code
L2  Profile                — development | staging | production (bundled)
L3  Deployment contract    — ~20 env vars (infra, secrets, profile, image)
L4  System runtime settings — DB + Hub System Settings (global admin)
L5  Tenant runtime settings — DB + APIs (tenant admin)
```

### Key rules

1. **L4 and L5 are never merged** in APIs or documentation (cluster vs namespace policy).
2. **Identity login is platform core** — not an L4 feature toggle.
3. **Security policy** (lockout, session TTL) lives in L4 `IdentityPolicy`, not env.
4. **Profiles** (`MLAIR_PROFILE`) are the primary deployment-mode knob; `mlair.yaml` stays thin.
5. **~20 variables** in the deployment contract (groups A–E); compose infra split to `deploy/.env.infra`.
6. **No new `os.getenv()`** in product code after refactor; single `Settings` read path.
7. **Package 002 Design Freeze** gates Identity implementation env expansion and Configuration refactor.

### Program order

```text
001 Identity Freeze (done) → 002 Configuration Freeze → 001 Implementation
→ 002 Refactor → 003–005 packages → roadmap implementation
```

---

## Alternatives considered

### A. Keep expanding `.env.example`

**Rejected.** Every feature adds 5–15 vars; operators cannot adopt; contradicts open-source UX.

### B. Put all policy in `mlair.yaml`

**Rejected.** Still a flat file; no hot reload; confuses deploy config with runtime policy; not GitHub Enterprise model.

### C. Single “runtime config” blob in DB

**Rejected.** Mixes system and tenant policy; same mistake as current `GET /v1/runtime-config` feature flags.

### D. Kubernetes-only ConfigMaps

**Rejected.** MLAir must support Docker Compose quickstart; L3 env contract remains for compose; K8s details deferred to Package 005.

---

## Consequences

### Positive

- Clear PR classification (L0–L5)
- Identity and execution work can proceed without env sprawl after freeze
- Hub System Settings become the operator surface
- Aligns with MLflow/Argo operator mental model

### Negative

- Up-front documentation cost (Package 002)
- Migration effort from ~190 vars (phased; aliases during transition)
- Short-term dual read paths (env alias + L4) until Phase 4

### Exceptions

- **Secrets (L3)** rotation may require rolling restart
- **Profile class change** may require redeploy

---

## References

- `docs/config/01-architecture-overview.md`
- `docs/config/02-configuration-layers.md`
- `docs/architecture/00-platform-architecture-series.md`
