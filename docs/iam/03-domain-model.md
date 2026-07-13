# P2 — Domain Model (Identity)

**Document ID:** `docs/iam/03-domain-model.md`  
**Phase:** P2 – Domain Model  
**Status:** **Approved — Domain Freeze v1.0** (2026-07-13)  
**Depends on:** P1 Architecture Freeze v1.0 (`02-target-identity-architecture.md`), ADR-008 Accepted  
**Companions:** `01-identity-lifecycle.md`  

> **Do not edit this document** except for critical defect fixes.  
> Material changes require a new ADR.  
> **Next:** P3 `04-logical-database.md`.  

**This document answers:** *What are the business concepts and how do they relate?*  
**This document does not answer:** table names, indexes, HTTP routes, UI layouts, or code.

---

## 0. Boundary

| Layer | Document |
|-------|----------|
| Architecture (frozen) | `02-target-identity-architecture.md` |
| **Domain Model (this doc)** | Business nouns & invariants (**Frozen**) |
| Logical Database | `04-logical-database.md` (next) |
| Human role capabilities | `07-human-role-capabilities.md` (later) |
| SA permission catalog | `08-service-account-permission-catalog.md` (later) |
| Authorization matrix | `09-authorization-matrix.md` (later) |

---

## 1. Concept map (start with Principal)

```text
Principal
├── User
└── ServiceAccount
└── Identity State          (kind-specific lifecycle)

User
├── Credential (password hash)          [human only]
├── RoleAssignment*                     [0..n]
└── Session*                            [0..n]

ServiceAccount
├── Credential (issued secret hash)     [0..n over time]
├── PermissionGrant*                    [0..n]
└── ScopeBinding*                       [0..n]

RoleAssignment
├── Tenant (exactly one)
├── Role (maintainer | viewer)
└── ProjectSelection (ALL | SELECTED → Project*)

ScopeBinding (Service Account)
├── Tenant (exactly one)
└── ProjectSelection (ALL | SELECTED → Project*)

Session
├── User
├── RefreshCredential (opaque)
└── metadata (device / IP / UA — conceptual)

AuditEvent                          (immutable append-only)
├── actor Principal (optional for system)
├── action
├── target
└── result / context (no secrets)
```

Global **Admin** is a User property/flag (or equivalent domain attribute), **not** a RoleAssignment row pretending to be “maintainer on all tenants”.

---

## 2. Principal

**Definition:** An identity that can be authenticated and then authorized against MLAir APIs.

**Kinds:**

| Kind | Description |
|------|-------------|
| `USER` | Human operator (Hub login) |
| `SERVICE_ACCOUNT` | Machine identity (worker, scheduler, executor, SDK, CI) |

**Invariants:**

- Every authenticated request resolves to exactly one Principal kind.  
- Authorization branch depends on kind (Role Assignment vs Permission).  
- Principal is a **domain abstraction**; persistence mapping is P3.  

---

## 2.1. Identity State

**Definition:** The lifecycle status of a Principal. User and Service Account each keep their **own** state machine (see `01-identity-lifecycle.md`), but both are forms of the same domain idea: **Identity State**.

```text
Principal
    ↓
Identity State

User
  Pending → Active → Locked → Disabled → Deleted

Service Account
  Created → Active → Revoked
```

| Kind | Identity States |
|------|-----------------|
| User | `pending_activation` · `active` · `locked` · `disabled` · `deleted` |
| Service Account | `created` · `active` · `revoked` |

**Invariants:**

- State sets are **not** unified into one enum across kinds; semantics differ (e.g. User `locked` ≠ SA `revoked`).  
- AuthN/AuthZ must respect Identity State (e.g. non-`active` principals cannot establish useful sessions / credentials).  
- Detailed transitions remain in `01-identity-lifecycle.md`; this section only names the shared concept.  

---

## 3. User

**Definition:** Human Principal that authenticates with username/password and holds Sessions.

**Attributes (conceptual):** identity handle (username), password credential, **Identity State** (User set above), optional Global Admin marker.

**Invariants:**

- Only Users participate in **RoleAssignment**.  
- Only Users own **Session** (refresh).  
- Non-admin Users with zero RoleAssignments have **no** project reach.  
- Users cannot modify their own Global Admin flag or RoleAssignments.  

Lifecycle: see `01-identity-lifecycle.md`.

---

## 4. ServiceAccount

**Definition:** Machine Principal that authenticates with an issued credential (not a password).

**Attributes (conceptual):** name/description, **Identity State** (SA set above), permission grants, scope bindings, credential metadata (`token_id`, issued/rotated/revoked, `last_used_at`).

**Invariants:**

- Never authorized via human roles or “effective Maintainer”.  
- Plaintext issued secret is shown at most once; domain stores only a **verifier** (hash).  
- Must have explicit PermissionGrant entries to act.  
- Must have ScopeBinding (or documented empty = no reach) before useful work.  

Lifecycle: see `01-identity-lifecycle.md`.

---

## 5. Role

**Definition:** Named human authority class in MVP: `admin` | `maintainer` | `viewer`.

**Invariants:**

- `admin` is **Global Administrator** — not attached via RoleAssignment.  
- `maintainer` and `viewer` appear **only** on RoleAssignment.  
- Detailed capability lists live in `07-human-role-capabilities.md` (later); Domain Model only requires the three role names and their nature.  

---

## 6. RoleAssignment

**Definition:** Grant that places a User into a **single Tenant** with role `maintainer` or `viewer` and a project selection.

**Structure:**

```text
RoleAssignment
  ├── User
  ├── Tenant          (exactly one)
  ├── Role            (maintainer | viewer)
  └── ProjectSelection
        ├── ALL
        └── SELECTED → set of Projects (same Tenant)
```

**Invariants (business rules):**

1. **One Assignment → one Tenant only.**  
   A RoleAssignment must not reference projects belonging to another tenant.

   Forbidden:

   ```text
   Tenant A + Project from Tenant C
   ```

2. **ALL Projects** means: the assignment automatically includes **all current and future projects under that Tenant** (child projects of the tenant). No need to enumerate each project on the assignment when `ALL` is chosen.

3. **SELECTED Projects** means: only the listed projects of that same Tenant; projects outside the list are out of reach for this assignment.

4. A User may hold **many** RoleAssignments (multi-tenant / multi-role combinations), e.g. Maintainer ALL on Tenant A and Viewer SELECTED on Tenant B.

5. **No duplicate RoleAssignments for the same User.**  
   Two RoleAssignments of the same User must not be identical on `(tenant, role, project selection)`.

   Forbidden:

   ```text
   Alice / Maintainer / Tenant A / ALL
   Alice / Maintainer / Tenant A / ALL   ← duplicate
   ```

   Allowed: same User + same Tenant with **different** role, or same role with a **different** project selection.

6. RoleAssignment is never used for ServiceAccount.

Naming: always **Role Assignment** in product language (ADR-008).

---

## 7. Scope

**Definition:** The tenant/project **reach** in which a Principal may operate.

**For User (non-admin):**

- Reach = union of all RoleAssignments.  
- For each assignment: if `ALL`, reach includes every project under that tenant; if `SELECTED`, only listed projects.  

**For User (admin):**

- Reach = global (all tenants/projects) for authorization purposes.  

**For ServiceAccount:**

- Reach = union of ScopeBindings (same ALL vs SELECTED semantics **within one tenant per binding**).  
- One ScopeBinding → exactly one Tenant (same invariant as RoleAssignment).  
- **No duplicate ScopeBindings for the same ServiceAccount.** Two bindings must not be identical on `(tenant, project selection)` for that SA. This is a business invariant (P3 may map it to a uniqueness constraint where appropriate).  

**Shared question:** *Does this Principal have reach on (tenant_id, project_id)?*

---

## 8. Permission

**Definition:** Fine-grained capability string for **Service Accounts** only (MVP), pattern `resource:action`.

Examples (illustrative; catalog deferred to `08-…`):

```text
tasks:lease
tasks:heartbeat
tasks:complete
tasks:fail
logs:write
metrics:write
artifacts:write
usage:write
```

**Invariants:**

- Permissions are granted to ServiceAccounts, not to Users, in MVP.  
- Users use Role capabilities (`07-…`), not this permission string set.  
- Holding a permission without Scope reach still denies the call.  

**PermissionGrant:** association ServiceAccount → Permission.

---

## 9. Session

**Definition:** Server-side record of a human login that backs an opaque Refresh Token.

**Invariants:**

- Belongs to exactly one User.  
- ServiceAccounts do not have Sessions.  
- Refresh rotates; revoked/expired sessions cannot mint Access Tokens.  
- Logout one / logout all / admin revoke are Session operations.  

---

## 10. AuditEvent

**Definition:** Business record of a security-relevant identity action.

**Conceptual fields:** time, actor (Principal or system), action type, target, result, client context (IP, User-Agent), correlation id.

**Invariants:**

- **Immutable / append-only.** Once written: no edit, no overwrite, no soft-mutate of payload. Corrections (if ever needed) are new events, not updates in place.  
- Never contains passwords or plaintext SA secrets.  
- Covers at least: login success/failure, logout, refresh anomalies, user/assignment/SA/session mutations (event set refined with catalog later).  

---

## 11. Credential (supporting concept)

| Principal | Credential type | Rules |
|-----------|-----------------|-------|
| User | Password | Hash only (Argon2id preferred) |
| ServiceAccount | Issued secret | Show-once; hash only; rotatable/revocable |

Not a separate top-level aggregate in every diagram, but required for AuthN semantics.

---

## 12. Relationship summary

| From | To | Cardinality | Notes |
|------|-----|-------------|-------|
| Principal | User \| ServiceAccount | 1:1 kind | Discriminated |
| Principal | Identity State | 1 | Kind-specific state set |
| User | RoleAssignment | 0..n | Unique by (tenant, role, project selection) |
| User | Session | 0..n | |
| RoleAssignment | Tenant | 1 | Invariant |
| RoleAssignment | Project | 0..n | Empty if ALL; else SELECTED subset of same tenant |
| ServiceAccount | PermissionGrant | 0..n | |
| ServiceAccount | ScopeBinding | 0..n | Each binding one tenant; no duplicate bindings |
| ScopeBinding | Project | 0..n | Same ALL/SELECTED rules |
| AuditEvent | Principal | 0..1 actor | Append-only |

---

## 13. Explicit non-concepts (out of Domain Model)

- HTTP routes, status codes  
- Table/column/index names  
- Wireframe steps  
- Exact TTL numbers  
- Full permission/capability matrices (docs 07–09)  

---

## 14. Gate checklist (P2) — CLOSED

- [x] Principal-first model accepted  
- [x] User / ServiceAccount separation accepted  
- [x] Identity State (shared concept, kind-specific values) accepted  
- [x] RoleAssignment invariants (one tenant; ALL = all child projects; SELECTED subset; no duplicates) accepted  
- [x] Scope / ScopeBinding semantics (incl. no duplicate bindings) accepted  
- [x] Permission = SA-only in MVP accepted  
- [x] Session = User-only accepted  
- [x] AuditEvent immutable / append-only / no secrets accepted  
- [x] No DB/API/UI leakage in this document  

**P2 Domain Gate: Approved.** Proceed to **P3 Logical Database** (`04-logical-database.md`).

---

## 15. References

- `docs/iam/02-target-identity-architecture.md` (Architecture Freeze v1.0)  
- `docs/iam/01-identity-lifecycle.md`  
- `docs/adr/008-role-assignment-model.md` (Accepted)  
- `docs/iam/00-current-authentication-analysis.md` (Approved)  

---

*P2 Domain Model — business concepts only. Domain Freeze v1.0.*
