# Tenant Runtime Settings (L5)

**Document ID:** `docs/config/04-tenant-runtime-settings.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

**Tenant runtime settings** are policies scoped to a **tenant** (and often a **project**). They are never environment variables.

This layer aligns with:

- Package **001** Identity (role assignments, service account scopes)
- Package **004** Governance (promotion, manifest, lineage)—to be specified

---

## Boundary: L4 vs L5

| L4 System | L5 Tenant |
|-----------|-----------|
| Default retention days | Tenant retention override |
| Default quota ceiling | Tenant quota limit |
| Platform promotion defaults | Tenant promotion rules |
| Global webhook allowlist | Tenant webhook URL + secret |
| Identity lockout policy | — (system-wide security) |

**Rule:** If the setting mentions a `tenant_id` or `project_id`, it is L5.

---

## Examples

| Domain | Storage / API |
|--------|----------------|
| Quota | Existing tenant quota APIs |
| Webhooks | Tenant-scoped webhook config |
| Dataset policy | Tenant/project governance APIs |
| Promotion policy | Model registry governance |
| Serving policy | Serving slots / deployment policy |
| IAM | Users, assignments, SAs (Package 001) |

---

## Hub experience

Tenant admins configure L5 under **tenant/project settings**—not under global System Settings.

Global Admin may view tenant L5 for support; changes should be audited per tenant.

---

## Package 004 overlap

Governance Architecture (Package 004) will own the **semantic model** for promotion, manifest, and lineage policy. This document only fixes the **layer rule**: those policies are L5 (or L4 for platform defaults), not `.env`.

---

## Non-goals

- Defining promotion state machines (Package 004)
- Defining quota enforcement algorithm (implementation)
