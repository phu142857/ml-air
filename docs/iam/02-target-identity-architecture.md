# P1 — Target Identity Architecture

**Document ID:** `docs/iam/02-target-identity-architecture.md`  
**Phase:** P1 – Target Architecture  
**Status:** **Approved — Architecture Freeze v1.0** (Identity Design Freeze v1.0, 2026-07-13)  
**Depends on:** P0 Approved (`00-current-authentication-analysis.md`)  
**Companions:** `01-identity-lifecycle.md`, `docs/adr/008-role-assignment-model.md`  
**Design baseline:** Identity Design Freeze v1.0  

> **Do not edit this document** except for critical defect fixes.  
> Material changes require a new ADR.  
> **Design complete:** see `DESIGN-FREEZE.md`. **Next:** `11-migration-plan.md`.  

**Companion design docs (also frozen/approved):**  
`07-human-role-capabilities.md`, `08-service-account-permission-catalog.md`, `09-authorization-matrix.md`, `10-error-model.md`.  

**This document answers:** *How should target Identity work, and why?*  
**This document does not answer:** how data is stored (P3), how HTTP looks (REST phase), how screens look (UI phase), or how code is written (Implementation).

---

## 0. Document boundary

| Layer | Question | Phase |
|-------|----------|-------|
| **Architecture (this doc)** | Why / what / how it behaves | P1 |
| Domain Model | Business nouns & relationships | P2 |
| Logical Database | How it is persisted | P3 |
| REST API | How it is accessed over HTTP | later |
| UI / Wireframes | How operators interact | later |
| Code | How it is implemented | after Gate |

---

## 1. Identity Overview

### 1.1 Goals

Replace Hub static bearer paste for humans with **login-first enterprise IAM**, while giving machines **Service Accounts** with least privilege — on a **single multi-tenant control plane** (one Hub / one API identity boundary).

Concrete outcomes:

1. Humans authenticate with username/password and short-lived Access Tokens.  
2. Machines authenticate with issued credentials (show-once, hash at rest).  
3. Humans are authorized via **Global Admin** or **Role Assignments** (not a single `users.role`).  
4. Machines are authorized via **permissions + scopes** (never an effective human role).  
5. Sessions, credentials, and admin IAM actions are revocable and auditable.  

### 1.2 Non-goals (P1 / MVP Identity)

- Implementing MFA, OIDC, LDAP, or SSO in the first shippable release  
- Full policy engines (OPA/Cedar)  
- Changing ML lifecycle domain semantics (runs, datasets, models)  
- Physical schema or Alembic  

### 1.3 Design principles

| Principle | Meaning for MLAir |
|-----------|-------------------|
| **Security by Default** | Deny unless Global Admin or an explicit Role Assignment / SA permission grants access |
| **Least Privilege** | Workers get only task/log/metric permissions; humans get only assigned tenants/projects |
| **Separation of Human & Machine Identity** | Login path ≠ Service Account path; no shared “maintainer-token” for both |
| **Login-first Hub** | Primary operator path is login; static Hub tokens are not the target |
| **Scope as shared constraint** | Both humans and machines are limited to tenant/project reach |
| **Extensibility without rewrite** | Roles, permissions, and IdPs can grow; Role Assignment shape stays stable |
| **Auditability** | Security-relevant actions leave an auditable trail |

### 1.4 Relation to as-is (P0)

| As-is | Target |
|-------|--------|
| One Bearer pipe for Hub + workers | Same transport possible; **identity type** diverges |
| Static `*-token` + optional JWT | Human: login → JWT Access + opaque Refresh; Machine: SA credential |
| Single `role` on principal | Human: Role Assignments; Machine: permissions |
| Token paste Hub | Login-first Hub |

---

## 2. Authentication

### 2.1 Human User

```text
Username + Password
        ↓
Verify (Argon2id preferred)
        ↓
Check state: active (not disabled / locked)
        ↓
Issue Access Token (JWT, short TTL)
Issue Refresh Token (opaque, server-side)
        ↓
Hub uses Access Token as Bearer
```

- Failed attempts contribute to **lockout** (threshold in Security / later policy docs).  
- Password never logged.  
- Users cannot self-elevate role or Role Assignments.  

### 2.2 Service Account

```text
Admin creates SA
        ↓
Attach permissions + scopes
        ↓
Issue credential (plaintext shown once)
        ↓
Store hash only (token_id + metadata)
        ↓
Worker / Scheduler / Executor / SDK send Bearer credential
```

- No username/password for machines.  
- Rotate = issue new credential, revoke previous hash.  
- Revoke = immediate failure on authenticate.  

### 2.3 Access Token

- **Format:** JWT (reuse existing HS256/JWKS verification capability from P0).  
- **Lifetime:** short.  
- **Purpose:** authorize API calls until expiry.  
- **Contents (conceptual):** subject, principal type (`USER` | `SERVICE_ACCOUNT`), and enough context for authz (or force server-side load of Role Assignments / permissions — exact claim set in later JWT claims spec).  
- **Not** a long-lived Hub paste secret.  

### 2.4 Refresh Token

- **Format:** opaque random string (not a JWT).  
- **Storage:** server-side (hash), tied to a Session.  
- **Capabilities:** refresh (with **rotation**), revoke one session, revoke all sessions.  
- **Compromise response:** reuse detection → revoke session family + audit event (detail in Security phase).  

### 2.5 Bootstrap Admin

```text
First deploy
        ↓
Env-seeded Global Admin (once)
        ↓
Admin logs in
        ↓
Creates users, Role Assignments, Service Accounts
        ↓
Bootstrap seed disabled if admin already exists
```

Replaces as-is reliance on default `admin-token` as the human bootstrap story (P0).

---

## 3. Authorization

### 3.1 Decision flow (target)

```text
                    authenticate()
                          │
                          ▼
                     Principal
                          │
              ┌───────────┴───────────┐
              │                       │
           USER                 SERVICE_ACCOUNT
              │                       │
              ▼                       ▼
     Scope / reach check        Scope check
              │                       │
              ▼                       ▼
     Role Authorization         Permission Authorization
     (Admin | Role Assignment)  (permission catalog)
              │                       │
              └───────────┬───────────┘
                          ▼
                   Business API
```

### 3.2 RBAC (humans)

Three default roles:

| Role | Authority |
|------|-----------|
| `admin` | Global Administrator |
| `maintainer` | Full resource ops **within** Role Assignments |
| `viewer` | Read-only **within** Role Assignments |

Viewer must not mutate. Maintainer must not escape assigned tenants/projects. Admin manages IAM and all resources.

### 3.3 Role Assignment Model

Canonical decision: **ADR-008**.

```text
Admin  → Global Administrator

Maintainer / Viewer → Role Assignment
                         Tenant
                         Role
                         All Projects | Selected Projects
```

Multi-assignment example (Alice): Maintainer on Tenant A (all projects) + Viewer on Tenant B (X, Z).

**No** authorizing scoped operators via a sole `users.role` field.

### 3.4 Scope Model

- Scope is **tenant + project reach**.  
- Humans: reach derived from Role Assignments (Admin = global).  
- Machines: reach derived from SA scopes.  
- Shared question for every request: *May this principal act in this tenant/project?*  

Exact persistence of scopes is **P2/P3**, not this document.

### 3.5 Permission Model (machines)

- Service Accounts do **not** inherit Maintainer/Viewer.  
- Permissions are fine-grained (`resource:action`), e.g. lease/complete/logs/metrics/artifacts/usage.  
- Human “permissions” in MVP are expressed as **role capabilities**, documented separately from the SA catalog (Design Freeze).  

Catalog contents and API matrices belong in later AuthZ matrix docs — P1 only fixes the **model**.

---

## 4. Identity Lifecycle

Full state machines: **`01-identity-lifecycle.md`**.

Summary:

| Entity | Essence |
|--------|---------|
| User | Bootstrap Admin → create → assign → login → refresh/logout → disable/lock/delete |
| Service Account | create → permissions/scopes → issue → use → rotate → revoke |
| Session | login → refresh (rotate) → logout / admin revoke |

P1 requires these lifecycles to remain consistent with this architecture; details live in the companion doc.

---

## 5. Security Principles

| Topic | Principle (architecture-level) |
|-------|--------------------------------|
| Password hashing | Argon2id preferred (bcrypt acceptable fallback); never plaintext |
| Access Token | Short-lived JWT; steal window limited |
| Refresh Token | Opaque; server-side; **rotation** on use; revocable |
| SA credential | Show-once; **hash only** at rest; revocable |
| Revocation | Sessions and SA credentials must fail closed after revoke |
| Lockout | Temporary lock after repeated failed logins |
| Password policy | Minimum length and complexity (exact rules in policy doc) |
| Transport | **HTTPS** for Hub/API in real deployments (enforced at deployment layer; VPN lab still TLS-capable) |
| Audit | Login success/failure, IAM mutations, revoke, SA issue — no secrets in payloads |
| Hub storage | Prefer not treating long-lived bearer paste as primary; session design detail later |

Threat model depth and secret inventory belong in the Security phase docs; P1 states the **non-negotiable principles**.

---

## 6. Future Extension

Architecture must not block:

| Extension | Seam |
|-----------|------|
| **MFA** | Step-up after password verify; Session flags |
| **OIDC / OAuth2 / SSO** | Link external subject → User; Role Assignments remain MLAir-native |
| **LDAP** | Directory sync or bind → User; same Role Assignment model |
| **Custom roles** | New role names + capability bundles; assignment shape unchanged |
| **External IdP groups** | Map group → Role Assignment templates (not implemented in MVP) |

MVP explicitly **does not implement** these; it only preserves seams (Design Freeze).

---

## 7. End-to-end architecture diagram

```text
                         ┌──────────────────────────────────────────┐
                         │         MLAir Control Plane (IAM)        │
                         │                                          │
   Operator ──login─────►│  User Identity                           │
                         │    password verify                       │
                         │    Access JWT (short)                    │
                         │    Refresh (opaque, rotatable)           │
                         │            │                             │
                         │            ▼                             │
                         │    Authorization                         │
                         │      Admin? → allow                      │
                         │      else Role Assignments               │
                         │      viewer → read-only                  │
                         │            │                             │
   Worker/SDK ─Bearer───►│  Service Account Identity                │
                         │    credential hash verify                │
                         │            │                             │
                         │            ▼                             │
                         │    Permission + Scope check              │
                         │            │                             │
                         │            ▼                             │
                         │    Domain APIs (runs, datasets, …)       │
                         │    Audit trail (IAM events)              │
                         └──────────────────────────────────────────┘

Lab topology (ops, not Identity logic):
  VM-1 Hub+API+IAM store  ←── VPN ──→ Operators
  VM-2 / VM-3 workers     ── SA Bearer ──→ VM-1 API
```

---

## 8. Gate checklist (P1) — CLOSED

- [x] Goals and principles accepted  
- [x] Human vs Machine authentication paths accepted  
- [x] Access JWT + opaque Refresh + rotation/revoke accepted  
- [x] Bootstrap Global Admin accepted  
- [x] Role Assignment (ADR-008) Accepted  
- [x] SA permission model (no effective role) accepted  
- [x] Lifecycle companion (`01-identity-lifecycle.md`) consistent  
- [x] Security principles listed (hashing, HTTPS at deploy, audit)  
- [x] Future extension seams listed without implementing them  
- [x] Explicit: no DB tables / no REST contracts in this document  

**P1 Architecture Gate: Approved.** Proceed to **P2 Domain Model** (`03-domain-model.md`).

---

## 9. Document map (agreed sequence)

| Order | Document | Phase |
|-------|----------|-------|
| 0 | `00-current-authentication-analysis.md` | P0 ✅ |
| 1 | `01-identity-lifecycle.md` | P1 |
| 2 | **`02-target-identity-architecture.md` (this file)** | P1 |
| 3 | `03-domain-model.md` | P2 |
| 4 | `04-logical-database.md` | P3 |
| 5 | `05-rest-api-specification.md` | REST |
| 6 | `06-ui-flow-and-wireframes.md` | UI |
| — | ADRs (008 + others) | parallel to P1–P2 |
| — | Migration / Implementation | after Gate |

---

## 10. References

- `docs/iam/00-current-authentication-analysis.md` (Approved)  
- `docs/iam/01-identity-lifecycle.md`  
- `docs/adr/008-role-assignment-model.md`  
- `paper-writing/Login-roadmap.md` (Design Freeze v1.0)  

---

*P1 Target Identity Architecture — why and what, not how stored or called.*
