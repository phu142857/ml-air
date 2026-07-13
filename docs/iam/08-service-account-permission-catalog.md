# Service Account Permission Catalog

**Document ID:** `docs/iam/08-service-account-permission-catalog.md`  
**Status:** **Approved** (Design Freeze v1.0)  
**Depends on:** Domain Freeze, Architecture Freeze  

Allowed `permission` strings for SA grants (`resource:action`). Humans do not use this catalog.

---

## MVP catalog

| Permission | Intent |
|------------|--------|
| `tasks:lease` | Claim/lease work items |
| `tasks:heartbeat` | Keep lease alive |
| `tasks:complete` | Mark task success |
| `tasks:fail` | Mark task failure |
| `logs:write` | Push logs |
| `metrics:write` | Push metrics |
| `artifacts:write` | Upload artifacts |
| `usage:write` | Report usage |

---

## Rules

- Grant only strings in this catalog (API rejects unknown).  
- Permission **and** ScopeBinding required for useful calls.  
- SA never receives Maintainer/Viewer effective role.  
- Extending the catalog = doc change + matrix update (`09`); prefer additive strings.

---

## Non-goals

- Human role capabilities (`07`)  
- HTTP path matrix (`09`)  
- Credential storage (P3)

## Post-MVP (not in Freeze)

Optional read permissions for inference workers, e.g. `models:read`, `datasets:read`, `runs:read` — add via ADR + catalog bump, not by editing Freeze silently.
