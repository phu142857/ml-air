# Authorization Matrix

**Document ID:** `docs/iam/09-authorization-matrix.md`  
**Status:** **Approved** (Design Freeze v1.0)  
**Depends on:** `05` REST, `07` capabilities, `08` SA catalog  

Middleware reference: after AuthN, decide allow/deny. Exact product routes beyond Identity may be extended over time; Identity routes are authoritative here.

---

## Decision reminder

```text
USER → reach (assignments | admin) + role capability (07)
SA   → scope binding + permission (08)
```

---

## Identity API matrix

| API | Viewer | Maintainer | Admin | SA permission |
|-----|--------|------------|-------|---------------|
| `POST /v1/auth/login` | — (public) | — | — | — |
| `POST /v1/auth/refresh` | — (refresh) | — | — | — |
| `POST /v1/auth/logout` | self | self | self | ✗ |
| `POST /v1/auth/logout-all` | self | self | self | ✗ |
| `GET /v1/auth/me` | self | self | self | ✗ |
| `GET/POST/PATCH/DELETE /v1/users*` | ✗ | ✗ | ✓ | ✗ |
| `*/assignments*` | ✗ | ✗ | ✓ | ✗ |
| `*/service-accounts*` | ✗ | ✗ | ✓ | ✗ |
| `GET/DELETE …/sessions*` | self† | self† | ✓ | ✗ |
| `GET /v1/audit` | ✗ | ✗ | ✓ | ✗ |

† Self only for own `user_id`; Admin for any user.

---

## Product API (pattern)

| Class | Viewer | Maintainer | Admin | SA |
|-------|--------|------------|-------|-----|
| Read in scope | ✓ | ✓ | ✓ | if permission + scope |
| Mutate in scope | ✗ | ✓ | ✓ | if permission + scope |
| IAM / global | ✗ | ✗ | ✓ | ✗ |

Worker examples: lease/heartbeat/complete/fail → matching `tasks:*` + scope; logs/metrics/artifacts/usage → matching `*:write` + scope.

---

## Post-MVP

When product surface grows, split this doc into Identity / Pipeline / Dataset / Model Registry matrices (`09A`…); keep Identity table authoritative for IAM routes.

---

## Deny examples → error codes (`10`)

| Situation | HTTP | `error.code` |
|-----------|------|--------------|
| No/invalid bearer | 401 | `INVALID_TOKEN` / `INVALID_CREDENTIAL` |
| Authenticated, wrong role/permission | 403 | `FORBIDDEN` |
| In role but outside tenant/project | 403 | `INSUFFICIENT_SCOPE` |
| Account locked | 423 | `ACCOUNT_LOCKED` |
| Duplicate assignment | 409 | `DUPLICATE_ASSIGNMENT` |
