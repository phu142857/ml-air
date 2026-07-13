# P4 — REST API Specification (Identity)

**Document ID:** `docs/iam/05-rest-api-specification.md`  
**Phase:** P4 – REST API  
**Status:** **Approved — API Freeze v1.0** (Design Freeze v1.0)  
**Depends on:** P3 Database Freeze v1.0, P2 Domain Freeze, P1 Architecture Freeze  

**This document answers:** *Which HTTP resources exist, and what do they accept/return?*  
**This document does not answer:** table DDL, Hub wireframes (`06`), capability catalogs (`07`/`08`), AuthZ matrix (`09`), error catalog detail (`10`), or code.

> Part of **Identity Design Freeze v1.0**. Material API contract changes require a new ADR.  
> Implementation follows Migration Plan (`11-migration-plan.md`).

---

## 0. Boundary & conventions

| Concern | Document |
|---------|----------|
| Why / concepts / storage | Frozen `02` / `03` / `04` |
| **HTTP contracts** | **This document** |
| Error codes (full catalog) | `10-error-model.md` |
| Who may call what | `09-authorization-matrix.md` |

**Conventions**

- Prefix: `/v1`
- Auth: `Authorization: Bearer <access_jwt | sa_secret>`
- JSON; ISO-8601 UTC timestamps
- Error body (see `10`): `{ "error": { "code", "message", "details?" } }`
- Secrets shown **once** only on issue/rotate responses
- **Role is never a User field.** Scoped authority lives only on Role Assignment APIs.
- `is_global_admin` is a bypass flag on User, not a role string.

### Endpoint map (MVP)

```text
Auth
  POST   /v1/auth/login
  POST   /v1/auth/refresh
  POST   /v1/auth/logout
  POST   /v1/auth/logout-all
  GET    /v1/auth/me

Users
  GET    /v1/users
  POST   /v1/users
  GET    /v1/users/{user_id}
  PATCH  /v1/users/{user_id}
  DELETE /v1/users/{user_id}

Role Assignments
  GET    /v1/users/{user_id}/assignments
  PUT    /v1/users/{user_id}/assignments          (replace entire set)
  POST   /v1/users/{user_id}/assignments          (add one)
  GET    /v1/assignments/{assignment_id}
  PATCH  /v1/assignments/{assignment_id}
  DELETE /v1/assignments/{assignment_id}

Service Accounts
  GET    /v1/service-accounts
  POST   /v1/service-accounts
  GET    /v1/service-accounts/{sa_id}
  PATCH  /v1/service-accounts/{sa_id}
  POST   /v1/service-accounts/{sa_id}/issue-secret
  POST   /v1/service-accounts/{sa_id}/rotate
  POST   /v1/service-accounts/{sa_id}/revoke
  GET    /v1/service-accounts/{sa_id}/credentials
  POST   /v1/service-accounts/{sa_id}/credentials/{token_id}/revoke
  GET|PUT /v1/service-accounts/{sa_id}/permissions
  GET|POST /v1/service-accounts/{sa_id}/scopes
  PATCH|DELETE /v1/service-accounts/{sa_id}/scopes/{scope_id}

Sessions
  GET    /v1/users/{user_id}/sessions
  DELETE /v1/users/{user_id}/sessions/{session_id}
  DELETE /v1/users/{user_id}/sessions

Audit
  GET    /v1/audit
```

---

## 1. Auth API

### 1.1 `POST /v1/auth/login`

**Auth:** none

```json
{ "username": "alice", "password": "…" }
```

**`200`**

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "<opaque>",
  "user": {
    "id": "…",
    "username": "alice",
    "is_global_admin": false,
    "state": "active"
  }
}
```

Creates Session. Audit without password.  
**Errors:** `INVALID_CREDENTIAL` → 401; `ACCOUNT_LOCKED` → 423; `ACCOUNT_DISABLED` / pending / deleted → 403 (see `10`).

### 1.2 `POST /v1/auth/refresh`

```json
{ "refresh_token": "<opaque>" }
```

**`200`:** new `access_token`, rotated `refresh_token`, `expires_in`.  
Reuse detection may revoke session family.

### 1.3 `POST /v1/auth/logout`

Optional body `{ "refresh_token" }` if Access already expired. Revokes current Session. **`204`.**

### 1.4 `POST /v1/auth/logout-all`

**Auth:** Access (self). Revokes all Sessions for caller. **`204`.**

### 1.5 `GET /v1/auth/me`

**Auth:** Access (User)

```json
{
  "id": "…",
  "username": "alice",
  "state": "active",
  "is_global_admin": false,
  "assignments": [
    {
      "id": "…",
      "tenant_id": "tenant-a",
      "role": "maintainer",
      "all_projects": true,
      "project_ids": []
    }
  ]
}
```

Global admin: `assignments` empty/omitted; reach is global. SA callers: not this endpoint (MVP).

---

## 2. User API

**Default caller:** Global Admin (`09`).  
**Must not** accept `role` / `roles` on create or patch.

### 2.1 `GET /v1/users`

Query: `state`, `q`, `limit`, `cursor`. Summaries only (no hashes).

### 2.2 `POST /v1/users`

```json
{
  "username": "bob",
  "password": "…",
  "state": "active",
  "is_global_admin": false
}
```

**`201`:** User resource. Assignments are separate (§3).

### 2.3 `GET /v1/users/{user_id}`

User resource; may include `assignments` summary for admin UI convenience.

### 2.4 `PATCH /v1/users/{user_id}`

Allowed: `state`, `password`, `is_global_admin`.  
Forbidden: self-change of `is_global_admin`; self-edit of own assignments via this API.

### 2.5 `DELETE /v1/users/{user_id}`

Transition to `deleted`; revoke all sessions. **`204`.**

---

## 3. Role Assignment API

Authority for Maintainer/Viewer is **only** here (ADR-008).

### 3.1 `GET /v1/users/{user_id}/assignments`

List for user. Client sort: `tenant_id`, `role`, `created_at` (no `display_order`).

### 3.2 `PUT /v1/users/{user_id}/assignments`

**Replace entire assignment set** (Hub “save assignments” / toggle UX).

```json
{
  "assignments": [
    {
      "tenant_id": "tenant-a",
      "role": "maintainer",
      "all_projects": true,
      "project_ids": []
    },
    {
      "tenant_id": "tenant-b",
      "role": "viewer",
      "all_projects": false,
      "project_ids": ["proj-x", "proj-z"]
    }
  ]
}
```

**`200`:** resulting list. Atomic replace; validates P2 invariants (one tenant per item, no cross-tenant projects, no duplicates).

### 3.3 `POST /v1/users/{user_id}/assignments`

Add **one** assignment (same body as one item above). **`201`.**  
`409` + `DUPLICATE_ASSIGNMENT` if identical `(tenant, role, project selection)`.

### 3.4 `GET /v1/assignments/{assignment_id}`

### 3.5 `PATCH /v1/assignments/{assignment_id}`

Update tenant / role / selection. Same invariants.

### 3.6 `DELETE /v1/assignments/{assignment_id}`

**`204`.** Top-level delete path (not nested under user) for simple Hub/admin clients.

---

## 4. Service Account API

### 4.1 CRUD

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/service-accounts` | List |
| `POST` | `/v1/service-accounts` | `{ "name", "description?" }` — **no** secret yet |
| `GET` | `/v1/service-accounts/{sa_id}` | |
| `PATCH` | `/v1/service-accounts/{sa_id}` | name, description, allowed state |

### 4.2 `POST /v1/service-accounts/{sa_id}/issue-secret`

First (or additional) credential. Multi-active allowed (P3).

**`201` show-once**

```json
{
  "token_id": "…",
  "secret": "<plaintext once>",
  "created_at": "…"
}
```

### 4.3 `POST /v1/service-accounts/{sa_id}/rotate`

Issue a **new** credential without automatically revoking old ones (rotation window).  
Optional body: `{ "revoke_token_id": "…" }` to revoke a specific previous key in the same call.

**`201`:** same show-once shape as issue-secret.

### 4.4 `POST /v1/service-accounts/{sa_id}/revoke`

Revoke the **Service Account** (Identity State → `revoked`). All credentials fail closed. **`204`.**

### 4.5 Credential list / per-key revoke

| Method | Path |
|--------|------|
| `GET` | `/v1/service-accounts/{sa_id}/credentials` |
| `POST` | `/v1/service-accounts/{sa_id}/credentials/{token_id}/revoke` |

List: metadata only (`token_id`, timestamps, `revoked_at`). Never `secret`.

**Wire format for machines:** `Authorization: Bearer <secret>` (hash lookup). Document `token_id` only for admin rotation UX.

### 4.6 Permissions

| Method | Path |
|--------|------|
| `GET` | `/v1/service-accounts/{sa_id}/permissions` |
| `PUT` | `/v1/service-accounts/{sa_id}/permissions` |

```json
{ "permissions": ["tasks:lease", "logs:write"] }
```

Replace set. Allowed strings: catalog `08`.

### 4.7 Scopes

| Method | Path |
|--------|------|
| `GET` | `/v1/service-accounts/{sa_id}/scopes` |
| `POST` | `/v1/service-accounts/{sa_id}/scopes` |
| `PATCH` | `/v1/service-accounts/{sa_id}/scopes/{scope_id}` |
| `DELETE` | `/v1/service-accounts/{sa_id}/scopes/{scope_id}` |

```json
{
  "tenant_id": "tenant-a",
  "all_projects": true,
  "project_ids": []
}
```

---

## 5. Session API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/users/{user_id}/sessions` | Metadata only |
| `DELETE` | `/v1/users/{user_id}/sessions/{session_id}` | Revoke one |
| `DELETE` | `/v1/users/{user_id}/sessions` | Revoke all for user |

Self-service: prefer Auth logout endpoints. Admin uses this section.

---

## 6. Audit API

### `GET /v1/audit`

Query: `from`, `to`, `actor_id`, `action`, `limit`, `cursor`.

Append-only list; `payload` follows P3 convention (`schema_version`, `metadata`). No mutate endpoints.

---

## 7. Canonical resource shapes

**User** — no `role` field:

```json
{
  "id": "…",
  "username": "alice",
  "state": "active",
  "is_global_admin": false,
  "created_at": "…",
  "updated_at": "…"
}
```

**RoleAssignment**

```json
{
  "id": "…",
  "user_id": "…",
  "tenant_id": "…",
  "role": "viewer",
  "all_projects": false,
  "project_ids": ["p1"],
  "created_at": "…"
}
```

**ServiceAccount**

```json
{
  "id": "…",
  "name": "worker-vet",
  "description": null,
  "state": "active",
  "created_at": "…"
}
```

**Session (metadata)**

```json
{
  "id": "…",
  "user_id": "…",
  "created_at": "…",
  "last_used_at": "…",
  "expires_at": "…",
  "revoked_at": null,
  "ip": null,
  "user_agent": null
}
```

---

## 8. Errors (summary)

Full catalog: **`10-error-model.md`**. Common mappings:

| HTTP | Example `error.code` |
|------|----------------------|
| 401 | `INVALID_CREDENTIAL`, `INVALID_TOKEN` |
| 403 | `INSUFFICIENT_SCOPE`, `FORBIDDEN` |
| 409 | `DUPLICATE_ASSIGNMENT`, `DUPLICATE_USERNAME` |
| 423 | `ACCOUNT_LOCKED` |
| 400 | `VALIDATION_ERROR`, `CROSS_TENANT_PROJECT` |

---

## 9. Explicitly out of P4

- OpenAPI YAML / codegen  
- JWT claim schema companion (optional later)  
- Wireframes (`06`)  
- Alembic / dual-run static tokens  
- Implementation

---

## 10. Gate checklist (P4) — CLOSED

- [x] Auth: login / refresh / logout / me  
- [x] Users without embedded role  
- [x] Assignments: list / replace-set / add / patch / delete-by-id  
- [x] SA: issue-secret / rotate / revoke (+ per-key revoke)  
- [x] Permissions + scopes  
- [x] Sessions + `GET /v1/audit`  
- [x] Errors deferred to `10` with stable codes  
- [x] No code / no Alembic in design phase  

**P4 API Freeze v1.0.** See `DESIGN-FREEZE.md` · next `11-migration-plan.md`.

---

## 11. References

- `04-logical-database.md` · `03-domain-model.md` · `02-target-identity-architecture.md`  
- `10-error-model.md` · `09-authorization-matrix.md` · ADR-008  

---

*P4 REST API — HTTP contracts only. Ready for API Gate.*
