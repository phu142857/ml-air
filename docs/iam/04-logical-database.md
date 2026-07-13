# P3 — Logical Database (Identity)

**Document ID:** `docs/iam/04-logical-database.md`  
**Phase:** P3 – Logical Database  
**Status:** **Approved — Database Freeze v1.0** (2026-07-13)  
**Depends on:** P2 Domain Freeze v1.0 (`03-domain-model.md`)  
**Does not replace:** Domain Model — P3 only maps storage  

> **Do not edit this document** except for critical defect fixes.  
> Material changes require a new ADR.  
> **Next:** P4 `05-rest-api-specification.md`.  

**This document answers:** *How are Domain concepts stored?*  
**This document does not answer:** why those concepts exist (P2), HTTP contracts, UI, Alembic migration steps, or runtime code.

---

## 0. Boundary

| Concern | Where |
|---------|--------|
| Business meaning & invariants | `03-domain-model.md` (**Frozen**) |
| **Tables, keys, constraints** | **This document** (**Frozen**) |
| REST | `05-rest-api-specification.md` |
| Capability / permission catalogs | `07` / `08` / `09` |

**Rule:** Do not restate Role Assignment / Scope / Permission semantics here. Reference P2 when an invariant becomes a constraint.

**Non-goals for columns:** UI-only fields (e.g. `display_order` on assignments) are **out of schema**. List UIs sort by `tenant_id` / `role` / `created_at`.

---

## 1. Mapping overview

| Domain concept | Logical table / structure |
|----------------|---------------------------|
| User | `users` |
| ServiceAccount | `service_accounts` |
| Identity State | column `state` on `users` / `service_accounts` (kind-specific enums) |
| Credential (User password) | columns on `users` (`password_hash`, …) |
| Credential (SA secret) | `service_account_credentials` |
| RoleAssignment | `user_role_assignments` |
| RoleAssignment → projects (SELECTED) | `user_role_assignment_projects` |
| PermissionGrant | `service_account_permissions` |
| ScopeBinding | `service_account_scopes` |
| ScopeBinding → projects (SELECTED) | `service_account_scope_projects` |
| Session | `user_sessions` |
| AuditEvent | `identity_audit_events` |

**Existing product tables** `tenants`, `projects` (or equivalent) remain the scope dimension; Identity tables **reference** them. This phase does not redesign tenant/project storage.

**Principal** is not a separate physical table in MVP: kind is implied by which table holds the row (`users` vs `service_accounts`). Optional later: polymorphic `principals` table — out of MVP.

---

## 2. `users`

| Column | Type (logical) | Notes |
|--------|----------------|-------|
| `id` | UUID / string PK | |
| `username` | string UNIQUE | login handle |
| `password_hash` | string | never plaintext |
| `state` | enum | User Identity State values from P2 |
| `is_global_admin` | boolean | Global bypass flag; **not** a role / not `users.role` |
| `failed_login_count` | int | optional lockout support |
| `locked_until` | timestamp nullable | |
| `created_at` / `updated_at` | timestamp | |
| `deleted_at` | timestamp nullable | if soft-delete for `deleted` state |

**Constraints:** `username` unique; `state` ∈ User Identity State set.

---

## 3. `user_role_assignments`

| Column | Type (logical) | Notes |
|--------|----------------|-------|
| `id` | PK | |
| `user_id` | FK → `users` | |
| `tenant_id` | FK → tenants | exactly one tenant |
| `role` | enum | `maintainer` \| `viewer` only |
| `all_projects` | boolean | `true` ⇒ ALL (no child rows required) |
| `created_at` / `updated_at` | timestamp | |

No `display_order` (or similar UI presentation columns).

**Constraints / rules (map P2):**

- FK integrity: projects listed for this assignment must belong to `tenant_id` (enforce via join table + app/DB check).  
- **No duplicate assignments** for same logical identity: uniqueness on `(user_id, tenant_id, role, all_projects)` when `all_projects = true`; when `all_projects = false`, uniqueness of the **project set** is enforced at application level or via normalized hash / exclusion — document intent: identical SELECTED sets must not duplicate (P2).  
- `role` never `admin`.

### 3.1 `user_role_assignment_projects`

| Column | Notes |
|--------|-------|
| `assignment_id` | FK → `user_role_assignments` |
| `project_id` | FK → projects |
| PK / UNIQUE | `(assignment_id, project_id)` |

**Rule:** Rows exist only when parent `all_projects = false`. Empty SELECTED set is invalid for a useful assignment (reject at write).

---

## 4. `service_accounts`

| Column | Type (logical) | Notes |
|--------|----------------|-------|
| `id` | PK | |
| `name` | string | |
| `description` | string nullable | |
| `state` | enum | SA Identity State set from P2 |
| `created_at` / `updated_at` | timestamp | |
| `revoked_at` | timestamp nullable | |

---

## 5. `service_account_credentials`

| Column | Notes |
|--------|-------|
| `id` | PK (`token_id` public id for rotation) |
| `service_account_id` | FK → `service_accounts` |
| `secret_hash` | verifier only |
| `created_at` | |
| `revoked_at` | nullable |
| `last_used_at` | nullable |

**Rule — multi-active credentials (rotation window):**

- Multiple **non-revoked** credentials **MAY** exist for one Service Account at the same time.  
- Each credential has an **independent** lifecycle (issue → use → revoke).  
- Administrators revoke credentials **individually** (e.g. revoke old key after workers adopt the new key).  
- Policy (config / later ops doc) may cap maximum active keys; that is **not** a hard schema uniqueness of “exactly one active”.  
- Plaintext never stored; shown at most once at issue time.

This matches common patterns (GitHub PAT / cloud access keys): overlap during rotate, then revoke the previous key.

---

## 6. `service_account_permissions`

| Column | Notes |
|--------|-------|
| `service_account_id` | FK |
| `permission` | string (`resource:action`) |
| PK / UNIQUE | `(service_account_id, permission)` |

Catalog of allowed `permission` values: `08-…` (not expanded here).

---

## 7. `service_account_scopes`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `service_account_id` | FK |
| `tenant_id` | FK → tenants |
| `all_projects` | boolean |
| `created_at` | |

**Constraints (map P2):**

- One binding → one tenant.  
- **No duplicate ScopeBindings** for the same SA on identical `(tenant_id, all_projects)` when ALL; SELECTED set uniqueness same intent as RoleAssignment (P2).  

### 7.1 `service_account_scope_projects`

| Column | Notes |
|--------|-------|
| `scope_id` | FK → `service_account_scopes` |
| `project_id` | FK → projects |
| UNIQUE | `(scope_id, project_id)` |

Rows only when parent `all_projects = false`; projects must belong to binding `tenant_id`.

---

## 8. `user_sessions`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `user_id` | FK → `users` |
| `refresh_token_hash` | opaque refresh verifier |
| `expires_at` | |
| `revoked_at` | nullable |
| `rotated_from_id` | nullable FK self | optional rotation chain |
| `ip` / `user_agent` | nullable metadata |
| `created_at` / `last_used_at` | |

**Rule:** Sessions belong only to Users. Access JWT is **not** stored as a session row (stateless access).

---

## 9. `identity_audit_events`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `occurred_at` | timestamp |
| `actor_kind` | `user` \| `service_account` \| `system` |
| `actor_id` | nullable |
| `action` | string |
| `target_type` / `target_id` | nullable |
| `result` | success / failure / … |
| `ip` / `user_agent` / `correlation_id` | nullable |
| `payload` | JSON (no secrets) — see convention below |

**Constraints (map P2):**

- **Append-only:** no UPDATE/DELETE of business payload in application paths; DB role may revoke UPDATE/DELETE on this table where feasible.  
- No password / SA plaintext in `payload`.  

### 9.1 `payload` JSON convention (not extra columns)

Guideline for the JSON document stored in `payload` (schema evolution without DB migrations for every event shape):

```json
{
  "schema_version": 1,
  "metadata": { },
  "...": "event-specific fields"
}
```

| Field | Meaning |
|-------|---------|
| `schema_version` | Integer version of this event’s payload shape |
| `metadata` | Optional non-secret context (e.g. client labels); keep small |
| event fields | Action-specific attributes at the top level or nested as needed |

Readers must tolerate unknown fields; writers must never put secrets in `payload`.

---

## 10. Cross-cutting storage rules

| P2 invariant | P3 expression |
|--------------|---------------|
| Identity State per kind | Separate enums on `users.state` / `service_accounts.state` |
| One assignment / binding → one tenant | Single `tenant_id` column + project FK checks |
| ALL projects | `all_projects = true` and empty project join |
| No duplicate RoleAssignment | Uniqueness strategy in §3 |
| No duplicate ScopeBinding | Uniqueness strategy in §7 |
| Audit immutable | Append-only `identity_audit_events` |
| Hash credentials | `password_hash` / `secret_hash` / `refresh_token_hash` only |
| SA rotation overlap | Multiple active rows in `service_account_credentials` (§5) |

**Indexes (logical, non-exhaustive):**  
`users(username)`; `user_role_assignments(user_id)`; `user_role_assignments(tenant_id)`; `user_sessions(user_id)`; `user_sessions(refresh_token_hash)`; `service_account_credentials(service_account_id)`; `service_account_credentials(id)` as public `token_id`; `identity_audit_events(occurred_at)`.

---

## 11. Explicitly out of P3

- Alembic revision files / migration order from static tokens  
- Exact PostgreSQL types / collation  
- REST path shapes  
- TTL numeric defaults (may appear as config later)  
- Full AuthZ matrix  
- UI sort/order columns  

---

## 12. Gate checklist (P3) — CLOSED

- [x] Entity → table mapping accepted  
- [x] Association → FK / join tables accepted  
- [x] Invariants → constraints / append-only audit accepted  
- [x] Multi-active SA credentials (rotation window) accepted  
- [x] Audit `payload` convention (`schema_version` + `metadata`) accepted  
- [x] No UI columns (e.g. `display_order`) on security objects  
- [x] No re-explanation of Domain Model business prose  
- [x] Principal not required as physical table (MVP) accepted  
- [x] `is_global_admin` retained as bypass flag (not `users.role`)  

**P3 Database Gate: Approved.** Proceed to **P4 REST API Specification** (`05-rest-api-specification.md`).

---

## 13. References

- `docs/iam/03-domain-model.md` (Domain Freeze v1.0)  
- `docs/iam/02-target-identity-architecture.md` (Architecture Freeze v1.0)  
- `docs/adr/008-role-assignment-model.md`  

---

*P3 Logical Database — storage mapping only. Database Freeze v1.0.*
