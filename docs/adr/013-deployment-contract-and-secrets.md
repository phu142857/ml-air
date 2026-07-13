# ADR-013: Deployment Contract and Secrets

**Status:** Accepted  
**Date:** 2026-07-13  
**Series:** 002 Platform Configuration Architecture  
**Deciders:** Platform architecture  
**Depends on:** ADR-011, ADR-012, Package 001 Identity

---

## Context

Operators need a **small, stable list** of environment variables for Docker Compose and Kubernetes: where to connect, which secrets to mount, which profile to run, which image to pull.

Identity bootstrap (admin password, service account secrets, JWT signing key) correctly belongs in deployment injection—but the project also exposed lockout thresholds, feature flags, and scheduler tuning in the same file.

---

## Decision

### Deployment contract (~20 variables)

Group **A–E** only in committed `.env.example`:

| Group | Purpose |
|-------|---------|
| A | Infrastructure URLs |
| B | Secrets (identity, SA bootstrap, signing) |
| C | Storage roots |
| D | `MLAIR_PROFILE` |
| E | Image tags / compose file |

See `docs/config/07-deployment-contract.md` for the authoritative list.

### Infra split

- **Application contract:** `.env` / `.env.example` (~20 vars)
- **Compose interpolation:** `deploy/.env.infra` (ports, `POSTGRES_PASSWORD`, Grafana bootstrap)

### Secrets

- L3 only; never in L4/L5 tables or audit payloads
- Bootstrap SA secrets in env seed DB once; rotation via Hub APIs (Package 001)
- Placeholders in example files; real values gitignored

### CI enforcement (post-refactor)

- `check_env_sync.py` fails if compose introduces undeclared keys
- `.env.example` line count cap (~30 active vars)

### Identity alignment

| Variable | Verdict |
|----------|---------|
| `ML_AIR_IDENTITY_JWT_SECRET` | L3 — keep |
| `ML_AIR_BOOTSTRAP_ADMIN_PASSWORD` | L3 — keep |
| `ML_AIR_SA_*_SECRET` | L3 — keep |
| `ML_AIR_LOGIN_LOCKOUT_*` | **Remove from contract** → L4 |
| `ML_AIR_FEATURE_IDENTITY_LOGIN` | **Remove** — platform core |
| `ML_AIR_LEGACY_STATIC_TOKENS` | Migration only; not in target example |

---

## Alternatives considered

### A. One secret env `ML_AIR_SECRETS_JSON`

**Rejected.** Opaque blob; poor compose UX; harder rotation.

### B. Vault-only (no env secrets)

**Rejected for quickstart.** Production may use Vault (Package 005); compose still needs L3.

---

## Consequences

- Identity implementation must not add env vars outside groups A–E
- Configuration refactor shrinks `.env.example` in phases (ADR-011 migration)
- Documentation and `mlair doctor` should validate required L3 vars per profile

---

## References

- `docs/config/06-secret-management.md`
- `docs/config/07-deployment-contract.md`
- `docs/config/09-migration-strategy.md`
