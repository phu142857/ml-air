# Secret Management (L3)

**Document ID:** `docs/config/06-secret-management.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

Secrets belong to **L3 (deployment contract)**. They are injected at deploy time via environment variables, Docker Compose secrets, Kubernetes Secrets, or a secret manager—they are **never** stored in L4/L5 settings tables or committed to git.

This document classifies secret types and rotation expectations. It does not define Identity credential storage (see Package 001 / `docs/iam/`).

---

## Secret categories

| Category | Examples | Rotation |
|----------|----------|----------|
| **Data plane** | `DATABASE_URL` (contains password), `REDIS_URL` | DBA / ops process |
| **Identity** | `ML_AIR_IDENTITY_JWT_SECRET`, bootstrap admin password | Planned rotation; invalidates sessions |
| **Legacy JWT** | `ML_AIR_JWT_HS256_SECRET` | Deprecate with legacy auth removal |
| **Service accounts** | `ML_AIR_SA_*_SECRET` bootstrap values | Per-credential revoke + issue (Hub); bootstrap env for first boot only |
| **Signing** | Manifest HMAC, Ed25519 keys, semantic event signing | Key rotation runbook (`docs/guides/rotate-keys.md`) |
| **Webhooks** | Bearer tokens, HMAC secrets | Per-tenant in L5; platform allowlist in L4 |
| **OAuth** | Client secret (future) | IdP rotation |

---

## Bootstrap vs runtime secrets

| Pattern | When | Layer |
|---------|------|-------|
| **Env bootstrap** | First deploy; empty DB | L3 — compose / K8s Secret |
| **Hub issue** | SA credential rotate, user password reset | L5/L4 APIs — secret shown once |
| **Secret manager reference** | Production | L3 — `env://` or file mount |

**Rule:** Bootstrap env secrets seed the database once. Ongoing rotation uses APIs (Package 001 SA credentials)—not new env vars per rotation.

---

## Compose vs Kubernetes

### Docker Compose (development / quickstart)

- Application secrets in `.env` (gitignored) or `docker compose --env-file`
- Infra passwords in `deploy/.env.infra` (optional split)
- Never commit real secrets; `.env.example` contains **placeholders only**

### Kubernetes / Helm (Package 005)

- Secrets as `Secret` resources; mounted or envFrom
- External Secrets Operator / Vault preferred for production
- Image digests pinned in values—not `:latest` in production

---

## Multi-key signing

Manifest and semantic event signing support keysets (`*_KEYS_JSON`, managed key files). Classification:

| Concern | Layer |
|---------|-------|
| Active key ID, allowed key IDs | L4 system setting (policy) |
| Private key material | L3 secret only |
| Algorithm choice (`hmac-sha256` vs `ed25519`) | L2 profile or L4 |

---

## Exceptions (require restart or rolling deploy)

Per ADR-011, two classes **cannot** be hot-reloaded:

1. **JWT signing secret rotation** — requires session invalidation strategy
2. **Profile class change** (`development` → `production`) — may require redeploy

All other L4 policy changes avoid full platform restart.

---

## Anti-patterns

| Reject | Why |
|--------|-----|
| Secret in `.env.example` with real value | Use placeholder `change-me` |
| Secret in runtime-config JSON response | Leak surface |
| Secret in audit event payload | Package 001 convention |
| New secret as env var without `06` + `07` classification | Contributor rules violation |

---

## ADR

[ADR-013: Deployment contract and secrets](../adr/013-deployment-contract-and-secrets.md)
