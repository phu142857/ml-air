# ADR-008: Role Assignment Model

**Status:** **Accepted**  
**Date:** 2026-07-13  
**Accepted:** 2026-07-13 (P1 Architecture Gate)  
**Deciders:** MLAir IAM / Tech Lead  
**Relates to:** Design Freeze (`paper-writing/Login-roadmap.md` v1.2), P0 Current Auth Analysis, `01-identity-lifecycle.md`, `02-target-identity-architecture.md` (Architecture Freeze v1.0)

---

## Context

P0 shows MLAir authorizes with a **single `role`** and **`tenant_id` / `project_ids`** embedded on a static token or JWT (`ROLE_WEIGHT` + `authorize_scope`). That model cannot express:

- One human as Maintainer on Tenant A (all projects) and Viewer on Tenant B (selected projects).  
- Global Administrator without overloading `project_ids: ["*"]` as a fake “all projects maintainer”.  
- Clear separation from machine identity (Service Accounts).

Lab topology (central Hub + Vet/YOLO workers) requires **multi-tenant human reach** without multiple Hubs.

Naming: use **Role Assignment** (not bare “Assignment”) to avoid collision with dataset/worker/task assignment concepts.

---

## Decision

### 1. Three default roles only (MVP)

| Role | Nature |
|------|--------|
| `admin` | **Global Administrator** — system-wide IAM and all resources |
| `maintainer` | Scoped operator — full resource management within Role Assignments |
| `viewer` | Scoped read-only within Role Assignments |

Architecture remains open to more roles later without changing the assignment shape.

### 2. Global Admin is not a scoped Maintainer

```text
Admin
    ↓
Global Administrator
```

Admin authority does **not** come from “Maintainer + all projects”.

### 3. Maintainer and Viewer use Role Assignment

```text
Maintainer / Viewer
    ↓
Role Assignment
```

Each **Role Assignment** contains:

```text
Tenant
    ↓
Role (maintainer | viewer)
    ↓
All Projects
        OR
Selected Projects[]
```

### 4. Multi-assignment

A User may hold many Role Assignments simultaneously.

Example:

```text
Alice
  Role Assignment #1
    Tenant A / Maintainer / All Projects
  Role Assignment #2
    Tenant B / Viewer / Project X, Project Z
```

### 5. No authorizing `users.role` for scoped operators

Source of truth for Maintainer/Viewer reach:

```text
users
  ↓
role_assignments
  ↓
role + tenant + project selector
```

Do **not** authorize scoped operators solely via a single `users.role` column.

### 6. Machine identity excluded from this ADR

Service Accounts use **permissions + scopes**, never an effective human role (see Domain Model). This ADR governs **human** Role Assignment only.

### 7. Invariants (Domain Model)

- **One Role Assignment → exactly one Tenant.** Projects on that assignment must belong to that tenant (no cross-tenant project lists).  
- **All Projects = true** means the assignment automatically includes **all current and future child projects** of that tenant.  
- **No duplicate Role Assignments** for the same User on identical `(tenant, role, project selection)`.

Canonical wording: `docs/iam/03-domain-model.md` (Domain Freeze v1.0).

---

## Consequences

### Positive

- Matches enterprise multi-tenant control planes (GitLab/K8s-style membership).  
- Supports one Hub, many projects (Vet / YOLO) with least privilege per human.  
- Clear Global Admin story for User Management.  
- Aligns API module `/users/{id}/assignments` and Hub Assignment UI.

### Negative / trade-offs

- AuthZ checks are richer than `ROLE_WEIGHT` (assignment query or claim snapshot).  
- Hub bootstrap/`accessible_scopes` must aggregate across assignments.  
- Migration from single-role static tokens needs dual-run (P0).

### Out of scope

- Physical table DDL  
- Permission catalog for Service Accounts  
- OIDC group → Role Assignment mapping  

---

## Compliance

Future PRs for human IAM must:

- Express Maintainer/Viewer reach only via Role Assignments  
- Keep Admin global  
- Use the name **Role Assignment** in docs/API/UI  
- Not reintroduce default Hub `viewer-token` / `maintainer-token` / `admin-token` as primary human identity  

---

## References

- `docs/iam/00-current-authentication-analysis.md` (Approved)  
- `docs/iam/01-identity-lifecycle.md`  
- `paper-writing/Login-roadmap.md` (Design Freeze v1.0)  
- As-is: `api/app/domains/governance/auth_service.py` (`ROLE_WEIGHT`, `authorize_scope`)

---

*ADR-008 — Role Assignment Model.*
