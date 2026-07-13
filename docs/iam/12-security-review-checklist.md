# Security Review Checklist (Identity IAM)

**Document ID:** `docs/iam/12-security-review-checklist.md`  
**Status:** Implementation gate (P11 §7 criterion 7)  
**Depends on:** [DESIGN-FREEZE.md](./DESIGN-FREEZE.md), [11-migration-plan.md](./11-migration-plan.md)

Use this checklist before signing off Identity cutover. All items should be **PASS** in target environments.

---

## Authentication

| # | Check | PASS criteria |
|---|--------|----------------|
| 1 | Human login | Hub uses `/login` + Access JWT + Refresh session; no default static token in UI |
| 2 | Password storage | scrypt hashes only; no plaintext passwords in DB or audit |
| 3 | Lockout | Failed logins → `423 ACCOUNT_LOCKED` after threshold |
| 4 | Refresh rotation | Refresh issues new session; old session revoked on refresh |
| 5 | Logout | Refresh revoke + client session cleared |

## Service Accounts

| # | Check | PASS criteria |
|---|--------|----------------|
| 6 | Worker auth | External workers use SA secret (`ML_AIR_SA_*_SECRET`), not human tokens |
| 7 | Platform auth | Scheduler / executor use platform SA (`ML_AIR_SA_SCHEDULER_SECRET`, `ML_AIR_SA_EXECUTOR_SECRET`) |
| 8 | Scope binding | SA calls denied outside tenant/project scope |
| 9 | Permission catalog | Only `08` catalog strings accepted; unknown rejected |
| 10 | Secret handling | Issue/rotate returns secret once; audit has no secret payloads |
| 11 | Credential revoke | Revoked credentials fail immediately |

## Authorization

| # | Check | PASS criteria |
|---|--------|----------------|
| 12 | Role assignments | Humans authorized via assignments / `is_global_admin` only |
| 13 | Assignment deny | Viewer cannot perform maintainer mutations (`403`) |
| 14 | IAM routes | Only Global Admin for `/v1/users*`, `/v1/service-accounts*`, `/v1/audit` |
| 15 | SA product API | Worker SAs cannot call maintainer product routes |

## Legacy removal

| # | Check | PASS criteria |
|---|--------|----------------|
| 16 | Legacy flag | `ML_AIR_LEGACY_STATIC_TOKENS=0` in target `.env` |
| 17 | No default static tokens | Compose / `.env.example` do not ship `admin-token` defaults |
| 18 | Worker global token | `ML_AIR_WORKER_TOKEN` bypass disabled when legacy off |

## Audit & ops

| # | Check | PASS criteria |
|---|--------|----------------|
| 19 | Audit coverage | login, assignment, SA credential, session revoke events present |
| 20 | Bootstrap | Global Admin + platform SAs seeded once; secrets from env only |
| 21 | JWT secrets | `ML_AIR_IDENTITY_JWT_SECRET` unique per environment; not committed |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Implementer | | | |
| Reviewer | | | |

*Identity Design Package v1.0 — security review gate only.*
