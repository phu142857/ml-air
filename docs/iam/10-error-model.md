# Error Model (Identity)

**Document ID:** `docs/iam/10-error-model.md`  
**Status:** **Approved** (Design Freeze v1.0)  
**Depends on:** P4 REST  

Stable `error.code` values for Identity (and shared AuthZ). Clients map codes to copy; servers must not rename codes casually.

---

## Response shape

```json
{
  "error": {
    "code": "DUPLICATE_ASSIGNMENT",
    "message": "Human-readable summary",
    "details": { }
  }
}
```

`details` optional (field errors, conflicting ids). Never include passwords or SA secrets.

---

## Catalog

| HTTP | `error.code` | When |
|------|--------------|------|
| 401 | `INVALID_CREDENTIAL` | Bad username/password |
| 401 | `INVALID_TOKEN` | Missing/malformed/expired Access or Refresh; revoked session |
| 401 | `INVALID_SA_CREDENTIAL` | Bad or revoked SA secret |
| 403 | `FORBIDDEN` | Authenticated but not allowed for this operation |
| 403 | `INSUFFICIENT_SCOPE` | Role/permission OK but tenant/project reach fails |
| 403 | `ACCOUNT_DISABLED` | User state `disabled` |
| 403 | `ACCOUNT_PENDING` | User state `pending_activation` |
| 403 | `ACCOUNT_DELETED` | User state `deleted` |
| 423 | `ACCOUNT_LOCKED` | User state `locked` / lockout window |
| 404 | `NOT_FOUND` | Unknown user, assignment, SA, session, etc. |
| 409 | `DUPLICATE_USERNAME` | Username taken |
| 409 | `DUPLICATE_ASSIGNMENT` | Same user + tenant + role + project selection |
| 409 | `DUPLICATE_SCOPE_BINDING` | Same SA + tenant + project selection |
| 400 | `VALIDATION_ERROR` | Schema / type / missing field |
| 400 | `CROSS_TENANT_PROJECT` | Project not under assignment/binding tenant |
| 400 | `INVALID_PERMISSION` | Permission string not in catalog `08` |
| 400 | `EMPTY_PROJECT_SELECTION` | `all_projects=false` with empty `project_ids` |
| 429 | `RATE_LIMITED` | Optional login throttle |

---

## Mapping rules

```text
401  →  Invalid Credential / Token
403  →  Forbidden or Insufficient Scope (or blocked account states)
409  →  Duplicate Assignment / Username / Scope
423  →  Account Locked
```

Prefer **423** for lockout (not 403) so Hub can show a distinct unlock message.

---

## Non-goals

- Full product-domain error taxonomy outside Identity  
- i18n message catalogs  
- Implementation of middleware

## Post-MVP

If SA names become unique per tenant: add `409` / `DUPLICATE_SERVICE_ACCOUNT_NAME` via ADR — not required for Design Freeze MVP.
