# Audit Model

**Document ID:** `docs/governance/05-audit-model.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Purpose

Separate **Identity audit** (who changed IAM / platform policy) from **product audit** (lifecycle actions). Package 004 defines which governance mutations must be auditable.

**Code:** `identity_audit_events` table, `identity_repository.insert_audit_event`, `system_settings_service.patch_system_settings`.

---

## Identity audit stream

Table: `identity_audit_events`  
API: `GET /v1/audit` (Global Admin)

| Action | When |
|--------|------|
| `auth.login` / `auth.login_failed` | Human login |
| `auth.logout` / `auth.logout_all` | Session end |
| `user.assignments.replace` | Role assignment changes |
| `service_account.issue_secret` / `rotate` / `revoke` | SA credential lifecycle |
| `bootstrap.global_admin` | First-boot admin seed |
| `bootstrap.service_account` | Platform SA seed |
| **`system_settings.patch`** | L4 platform policy change |

**Rule:** audit payloads never contain secrets, password hashes, or raw tokens.

### L4 governance audit

On successful `PATCH /v1/system/settings`, the API records:

```text
action: system_settings.patch
target_type: system_settings
target_id: default
payload: { "keys": ["hub", "governance", ...] }  // top-level patch keys only
```

Actor: Global Admin user id from Access JWT.

---

## Product / lifecycle audit

Model promotion, dataset uploads, run state changes, and webhook deliveries use **domain tables** and semantic events—not the identity audit table.

Future work (post-v1.0): unified operator audit export merging identity + product streams.

---

## Hub surfaces

| Surface | Audit type |
|---------|------------|
| Admin → Audit | Identity audit events |
| Run / model history | Execution + registry rows |
| System settings save | Identity audit (`system_settings.patch`) |

---

## Compliance checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Login failures audited | Shipped |
| 2 | SA credential ops audited | Shipped |
| 3 | L4 settings PATCH audited | Shipped |
| 4 | Assignment changes audited | Shipped |
| 5 | No secrets in audit JSON | Enforced by writers |

---

## Non-goals (v1.0)

- Immutable external SIEM export format
- Tenant-scoped audit partition keys
