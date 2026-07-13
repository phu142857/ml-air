# P1 — Identity Lifecycle

**Status:** Companion to Architecture Freeze — included in **Identity Design Freeze v1.0**  
**Depends on:** P0 Approved (`00-current-authentication-analysis.md`)  
**Canonical architecture:** `02-target-identity-architecture.md` (**do not expand lifecycle into DB/API here**)  
**Design baseline:** Identity Design Freeze v1.0  
**Non-goals:** No schema DDL, no API payloads, no UI mockups (those are later phases / frozen separately)

---

## 1. Purpose

Define the **lifecycle states and transitions** for human Users and Service Accounts in target MLAir IAM. This document freezes **behavior**, not storage.

---

## 2. Principal types

```text
Principal
├── User              (human)
└── Service Account   (machine)
```

Only **Users** participate in **Role Assignment**.  
Only **Service Accounts** carry **permissions** (fine-grained).  
Both are subject to **scope** (tenant/project reach) as defined in ADR-008 and Domain Model.  
Both expose an **Identity State** (kind-specific values; shared concept — see Domain Model §2.1).

---

## 3. User lifecycle

### 3.1 States

| State | Meaning |
|-------|---------|
| `pending_activation` | Created; cannot login until activated (optional MVP path) |
| `active` | May authenticate (subject to lockout) |
| `locked` | Temporary lock after failed logins; admin unlock |
| `disabled` | Admin disabled; no login |
| `deleted` | Soft-delete or hard-delete policy (TBD in Domain Model); no login |

### 3.2 Happy path

```text
Bootstrap Global Admin (env, once)
        ↓
    active
        ↓
Create User (admin)
        ↓
pending_activation  OR  active   (MVP may create Active directly)
        ↓
Role Assignment(s)   [maintainer|viewer + tenant + projects]
        ↓
Login → Access JWT + Refresh Session
        ↓
Refresh / Logout (one|all)
        ↓
(optional) Disable → disabled
(optional) Lock → locked → Unlock → active
(optional) Delete → deleted
```

### 3.3 Global Admin

- Created only via **bootstrap** (or break-glass runbook).  
- **Not** represented as Maintainer on all projects.  
- May manage Users, Role Assignments, Service Accounts, Sessions, IAM Audit.  

### 3.4 Invariants

- A User without Role Assignments (and not Global Admin) has **no** project reach.  
- Users cannot escalate their own role or assignments.  
- Password never stored plaintext; never appear in audit payloads.  

---

## 4. Service Account lifecycle

### 4.1 States

| State | Meaning |
|-------|---------|
| `created` | Metadata exists; no usable credential yet (or credential revoked) |
| `active` | Has at least one non-revoked, non-expired credential |
| `revoked` | SA or all credentials revoked; cannot authenticate |

(Credential-level: `issued` → `active` → `rotated`/`revoked`.)

### 4.2 Happy path

```text
Create Service Account (admin)
        ↓
Attach permissions (catalog)
        ↓
Attach scopes (tenant + projects)
        ↓
Issue credential  →  show-once secret to admin
        ↓
Copy / download → Worker / Scheduler / Executor / SDK env
        ↓
Active use (last_used_at)
        ↓
Rotate (re-issue; previous hash revoked)
        ↓
Revoke (SA or credential)
```

### 4.3 Invariants

- Plaintext credential **never** stored; only hash + `token_id`.  
- SA **never** authorized via human `ROLE_WEIGHT` / effective role.  
- Least privilege: permissions explicit (e.g. `tasks:lease`, `logs:write`).  
- Unscoped global worker token (`ML_AIR_WORKER_TOKEN` as-is) is **out of target**; P0 notes dual-run until SA cutover.  

---

## 5. Session lifecycle (human only)

```text
Login success
        ↓
Create refresh session (opaque) + Access JWT
        ↓
Refresh (rotate)  OR  Expire until Access expiry
        ↓
Logout current  OR  Logout all  OR  Admin revoke session
        ↓
Session revoked / expired
```

Reuse of an already-rotated refresh token → security event (see Audit) + revoke family of sessions (policy in Security phase).

---

## 6. Mapping from P0 as-is

| As-is | Lifecycle target |
|-------|------------------|
| Paste static Hub token | User Login + Session |
| `admin-token` | Bootstrap Global Admin user |
| `ML_AIR_TRACKING_TOKEN` / worker env | Service Account credential |
| No disable/lock | User `disabled` / `locked` |
| No revoke | Session revoke + SA credential revoke |

---

## 7. Open items (defer, do not block Freeze)

- Soft vs hard delete for Users  
- Whether MVP skips `pending_activation`  
- Exact Access/Refresh TTL numbers (Security phase)  

---

## 8. Acceptance

- [ ] User and SA state machines agreed  
- [ ] Global Admin ≠ scoped Maintainer  
- [ ] Show-once SA issue agreed  
- [ ] No contradiction with ADR-008  

---

*P1 Identity Lifecycle — Architecture Freeze draft.*
