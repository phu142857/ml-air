# Migration Plan (Identity) — Implementation Planning

**Document ID:** `docs/iam/11-migration-plan.md`  
**Status:** **Approved** (Identity Design Package v1.0)  
**Depends on:** [DESIGN-FREEZE.md](./DESIGN-FREEZE.md), P0 as-is, P3 logical schema, P4 REST  

**This document answers:** *How do we move from P0 static tokens to Design Freeze Identity without breaking the lab?*  
**This document does not answer:** redesign of IAM concepts (frozen), full SQL DDL copy-paste, or feature code.

> Part of **Identity Design Package v1.0**. Cutover strategy is frozen; implementation follows §6–§7. Material strategy changes require a new ADR.

---

## 0. Principles

1. Design Freeze docs are source of truth; this plan only sequences cutover.  
2. Dual-run before hard cutover.  
3. Machines first or humans first — choose one primary path; recommended: **bootstrap Admin + SA for workers**, then Hub login, then deprecate human static tokens.  
4. Alembic starts only after this plan is accepted (**now approved**).

---

## 1. Current → Target (P0 reminder)

| As-is (P0) | Target |
|------------|--------|
| Static `viewer`/`maintainer`/`admin` tokens | Human login + Role Assignments; Admin = `is_global_admin` |
| Optional JWT | Access JWT + opaque Refresh sessions |
| Shared worker/tracking tokens | Service Accounts + permissions + scopes |
| Hub paste bearer | Login-first Hub |
| `auth_scope_context_overrides` only | Full identity tables (P3) |

---

## 2. Phased cutover

### Phase A — Schema (Alembic)

Create tables from P3: `users`, `user_role_assignments`, `user_role_assignment_projects`, `service_accounts`, `service_account_credentials`, `service_account_permissions`, `service_account_scopes`, `service_account_scope_projects`, `user_sessions`, `identity_audit_events`.

**Artifact:** `api/alembic/versions/0043_identity_schema.py` (revises `0042_run_log_entries`). Schema only — no seed / dual-run / auth logic.

No removal of static token auth yet.

### Phase B — Bootstrap

1. Env-seed Global Admin once (Architecture).  
2. Create SAs for scheduler / executor / Vet worker / YOLO worker; issue secrets; grant `08` permissions + scopes.  
3. Point worker env vars to SA secrets (parallel to old tokens if needed).

### Phase C — Dual-run AuthN

Middleware accepts, in order:

1. SA credential  
2. User Access JWT  
3. Legacy static token (compat flag `ML_AIR_LEGACY_STATIC_TOKENS=1`)

Map legacy static roles → temporary principal equivalent **only** for dual-run; do not write new features against static tokens.

### Phase D — Hub login

Ship P5 login + assignment UI against P4 APIs. Operators stop pasting human static tokens.

### Phase E — Deprecate legacy

1. Disable legacy static human tokens via flag.  
2. Remove defaults from docs/compose.  
3. Keep dual-run window documented for one release.  
4. Delete compat code after gate.

### Phase F — Hardening

Integration tests (login, assignment deny, SA lease, rotate overlap, lockout 423). Security review checklist against Design Freeze.

---

## 3. Rollback

- Re-enable legacy static token flag.  
- Do not drop identity tables on rollback (data preserved).  
- Revoke bad SA keys individually (P3 multi-active).

---

## 4. Explicit non-goals

- Redesigning Role Assignment / Principal model  
- Splitting `09` into product matrices  
- Adding SA `*:read` catalog entries (post-MVP)

---

## 5. Gate checklist (P11) — CLOSED

- [x] Design Freeze v1.0 acknowledged by implementers  
- [x] Phase order A→F accepted  
- [x] Dual-run flag strategy accepted  
- [x] Worker SA inventory listed for lab (Vet / YOLO / scheduler / executor)  
- [x] Implementation Order (§6) and Definition of Done (§7) accepted  
- [x] Ready for first Alembic revision  

**P11 Approved.** Open Implementation per §6.

---

## 6. Implementation Order

Build in this sequence (do not skip ahead to Hub UI before AuthN works):

```text
 1. Alembic Revision #1          (Phase A tables from P3)
 2. SQLAlchemy Models
 3. Repository Layer
 4. Auth Service                 (password verify, SA hash verify, session/refresh)
 5. JWT Middleware               (Access Token → User principal)
 6. Service Account Middleware   (Bearer secret → SA principal)
 7. Dual-run / Legacy adapter    (flag-gated static tokens — Phase C)
 8. Auth APIs                    (login / refresh / logout / me — P4 §1)
 9. User + Assignment APIs       (P4 §2–§3)
10. Service Account APIs         (issue-secret / rotate / revoke / permissions / scopes)
11. Session + Audit APIs
12. Authorization checks         (matrix 09 + catalogs 07/08 + errors 10)
13. Hub UI                       (login-first + assignment editor — P5 / Phase D)
14. Worker cutover to SA         (Phase B completion)
15. Remove Legacy                (flag OFF → delete compat — Phase E)
16. Integration Test + Security Review  (Phase F)
```

Phases A–F remain the **cutover** narrative; this list is the **engineering** order that realizes them.

---

## 7. Definition of Done

**Migration is complete** when all of the following are true:

| # | Criterion |
|---|-----------|
| 1 | No operator workflow depends on human static `*-token` paste |
| 2 | Workers / scheduler / executor authenticate with **Service Accounts** |
| 3 | Hub is **login-first** (Access JWT + Refresh session) |
| 4 | `ML_AIR_LEGACY_STATIC_TOKENS` (or equivalent) is **OFF** in target environments |
| 5 | Identity **audit** covers login, assignment, SA credential, and session revoke events (no secrets in payloads) |
| 6 | Integration tests for Identity cutover **PASS** (incl. assignment deny, SA lease permission, lockout → 423) |
| 7 | Security review against Design Freeze checklist signed off |

Until then, treat migration as **in progress** even if individual APIs ship.

---

## 8. References

- `DESIGN-FREEZE.md`  
- `00-current-authentication-analysis.md`  
- `04-logical-database.md` · `05-rest-api-specification.md` · `08` · `09` · `10`  
- ADR-008 · ADR-009 · ADR-010  

---

*Implementation planning only — not an architecture redesign. Identity Design Package v1.0.*
