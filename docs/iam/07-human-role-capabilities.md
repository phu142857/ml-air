# Human Role Capabilities

**Document ID:** `docs/iam/07-human-role-capabilities.md`  
**Status:** **Approved** (Design Freeze v1.0)  
**Depends on:** Domain Freeze, ADR-008  

Bridge between Architecture (roles) and Authorization Matrix (`09`). Not REST, not DB.

---

## Roles

| Role | Nature |
|------|--------|
| Admin (`is_global_admin`) | Global bypass — IAM + all product resources |
| Maintainer | Full resource management **within** Role Assignments |
| Viewer | Read-only **within** Role Assignments |

---

## Capability summary

| Capability area | Viewer | Maintainer | Admin |
|-----------------|--------|------------|-------|
| Read pipelines / runs / tasks / datasets / models (in scope) | ✓ | ✓ | ✓ |
| Create / update / delete product resources (in scope) | ✗ | ✓ | ✓ |
| Trigger runs / manage worker-facing product ops (in scope) | ✗ | ✓ | ✓ |
| Manage Users / Role Assignments / SAs / Sessions / Audit | ✗ | ✗ | ✓ |
| Escape assigned tenant/project | ✗ | ✗ | ✓ (global) |

Detailed route-level mapping: `09-authorization-matrix.md`.  
Machine permissions are **not** listed here (`08`).

---

## Invariants

- Viewer must not mutate.  
- Maintainer must not act outside assignment reach.  
- Admin is not “Maintainer on all projects”.  
- No authorizing via `users.role` column.
