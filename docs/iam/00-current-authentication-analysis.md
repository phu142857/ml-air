# P0 — Current Authentication Analysis

**Document type:** Current State Report (read-only inventory)  
**System:** MLAir  
**Module:** Identity & Access (as-is)  
**Date:** 2026-07-13  
**Scope:** Repository analysis only — no code changes  
**Design baseline:** `paper-writing/Login-roadmap.md` v1.2 = **Design Freeze v1.0**  
**Status:** **Approved** (Tech Lead review 2026-07-13; polish v1.1)  
**Next:** P1 Architecture Freeze (`01-identity-lifecycle.md`, ADR-008 Role Assignment Model)

---

## 0. Non-Goals

P0 does **NOT**:

- Redesign IAM or invent target schemas  
- Create database tables, migrations, or Alembic  
- Create new REST APIs or UI  
- Modify source code  
- Choose Access/Refresh cookie strategy  
- Implement login or Service Accounts  

P0 only answers: **what exists today, what must be kept, what must change later.**

---

## 1. Executive Summary

MLAir today authenticates almost exclusively via **HTTP `Authorization: Bearer`**. There is **no login page**, **no user database**, **no password hashing**, **no refresh sessions**, and **no Service Account entity**.

Human and machine callers share the same credential model:

1. **Static opaque tokens** baked into defaults (`viewer-token`, `maintainer-token`, `admin-token`) or overridden by `ML_AIR_AUTH_TOKENS_JSON`.
2. Optionally **JWT** (HS256 secret and/or RS256 JWKS) whose claims must include `role`, `tenant_id`, `exp`, `iat`.

Authorization is a single function `authorize_scope(principal, tenant_id, project_id, min_role)` using **`ROLE_WEIGHT`** (`viewer` < `maintainer` < `admin`) plus tenant/project membership from the token claims. This is **single-role-per-principal**, not the frozen **Role Assignment Model** (multi-assignment per user).

Hub operators paste a bearer into **Settings → Session**; default client state is `maintainer-token`. Token + scope live in `localStorage`.

Automation consumers (executor, scheduler, external lease workers, SDK) use env tokens (`ML_AIR_TRACKING_TOKEN`, `ML_AIR_WORKER_TOKEN`, etc.), typically the same static maintainer/admin strings.

**Implication for IAM redesign:** replace **human** static tokens with login + JWT/refresh + Role Assignments; keep **machine** access via managed Service Accounts — do not break scheduler/executor/worker/SDK paths during cutover.

---

## 2. Current Authentication Architecture

### 2.0 Authentication Boundary

```text
                         ┌─────────────────────────────────────┐
                         │              MLAir                  │
                         │                                     │
  Hub (browser) ────────►│  API (/v1) + Realtime WS            │
  curl / CLI / tests ───►│                                     │
  Scheduler ────────────►│         authenticate_bearer()       │
  Executor ─────────────►│                 │                   │
  External Worker ──────►│                 ▼                   │
  SDK ──────────────────►│         Principal (as-is)           │
                         │                 │                   │
                         │         authorize_scope()           │
                         │                 │                   │
                         │         Domain APIs / lease / WS    │
                         └─────────────────────────────────────┘

Boundary split (logical, same Bearer pipe today):

  HUMAN                          MACHINE / AUTOMATION
  ─────                          ───────────────────
  Hub operator                   Scheduler
  (paste token)                  Executor
                                 External Worker
                                 SDK worker client

  Same credential types today: Static token map  OR  JWT
  Target (Design Freeze): Human → Login; Machine → Service Account
```

P1 only needs to **replace the Human branch**; the Machine branch must keep working (via SA) across cutover.

### 2.1 Entry points checklist

| Mechanism | Present? | Where |
|-----------|----------|--------|
| HTTP Bearer | **Yes** | Virtually all `/v1` routes; Hub API client; WS query `token=` |
| Static token map | **Yes** | `auth_service._default_tokens` / `ML_AIR_AUTH_TOKENS_JSON` |
| JWT HS256 | **Yes** (if secret set) | `ML_AIR_JWT_HS256_SECRET` |
| JWT RS256 / JWKS | **Yes** (if URL set) | `ML_AIR_JWT_JWKS_URL` |
| Cookie session | **No** | — |
| API Key header (separate) | **No** (Bearer only) | — |
| Basic Auth | **No** | — |
| Username/password login | **No** | No `/login`, no password store |
| Disabled auth mode | **No** | Missing Authorization → 401 |

### 2.2 Core authenticate path

```text
Client (Hub / curl / worker / SDK)
        │
        │  Authorization: Bearer <token>
        ▼
authenticate_bearer()          # api/app/domains/governance/auth_service.py
        │
        ├─► Try JWT decode (HS256 / RS256+JWKS)
        │       └─► Principal(role, tenant_id, project_ids, subject, …)
        │
        └─► Else lookup static token DB
                └─► Principal(…)  issuer="static_token"
                        │
                        ▼
                authorize_scope(...) on most routes
```

**Realtime service** duplicates the same static/JWT contract in `realtime/app/auth_ws.py` (parallel copy, not shared import).

**WebSocket run logs:** token passed as query param; server wraps as `Bearer` then `authenticate_bearer` + `authorize_scope` (viewer+).

### 2.3 Principal shape (as-is)

```text
Principal
  token
  subject
  token_issuer          # "jwt" | "static_token"
  scope_mapping_version
  role                  # single: viewer | maintainer | admin
  tenant_id             # single tenant
  project_ids           # list or ["*"] for admin default
```

No `principal_type` (USER vs SERVICE_ACCOUNT). No multi-tenant Role Assignments.

---

## 3. Current Authorization Architecture

### 3.1 Primitives

| Symbol | Location | Role |
|--------|----------|------|
| `ROLE_WEIGHT` | `auth_service.py`, `realtime/app/auth_ws.py` | viewer=1, maintainer=2, admin=3 |
| `authenticate_bearer` | `auth_service.py` | AuthN |
| `authorize_scope` | `auth_service.py` | AuthZ: min_role + tenant + project |
| `authenticate_worker_lease_principal` | `auth_service.py` | Special case for `/tasks/lease` |
| Hub nav role inference | `frontend/lib/hub-nav-access.ts` | Hides Execution for viewer |

There is **no** FastAPI global auth middleware; each route (or helper) calls authenticate/authorize explicitly (~100 call sites in `v1.py`).

### 3.2 `authorize_scope` rules

1. `ROLE_WEIGHT[principal.role] >= ROLE_WEIGHT[min_role]`  
2. If `principal.tenant_id` set → must equal path `tenant_id`  
3. If `project_ids` non-empty and not `*` → path `project_id` must be listed  

**Gaps vs Design Freeze:**

- One role per token (cannot be Maintainer on Tenant A and Viewer on Tenant B).  
- Admin is `role=admin` + `project_ids=["*"]` in default static token — close to Global Admin but not Role Assignment.  
- No permission strings for workers (`tasks:lease` etc.).  
- Viewer write denial depends on each route’s `min_role` (not a global GET-only gate).

### 3.3 Worker lease special case

`authenticate_worker_lease_principal`:

- If `ML_AIR_WORKER_TOKEN` set and Bearer matches (hmac compare) → **Principal = None** (global lease, no tenant filter).  
- Else require bearer with role ≥ maintainer (static or JWT).  

This is a **machine credential** precursor to Service Accounts, but unconstrained when using the dedicated worker token.

---

## 4. Static Token Usage

### 4.1 Default tokens

| Token | Role | Tenant | Projects |
|-------|------|--------|----------|
| `viewer-token` | viewer | `default` | `default_project` |
| `maintainer-token` | maintainer | `default` | `default_project` |
| `admin-token` | admin | `default` | `*` |

Override: entire map via `ML_AIR_AUTH_TOKENS_JSON` (JSON object).

### 4.2 Consumers by class

**Human**

| Consumer | Typical credential | Notes |
|----------|-------------------|--------|
| Hub UI | Paste / default `maintainer-token` | `localStorage` key `ml-air:ui-context` |

**Automation (machine)**

| Consumer | Typical credential | Notes |
|----------|-------------------|--------|
| Executor | `ML_AIR_TRACKING_TOKEN` (often `maintainer-token` / `admin-token`) | API callbacks |
| Scheduler | `ML_AIR_TRACKING_TOKEN` | API calls |
| External Worker | `ML_AIR_WORKER_TOKEN` or maintainer+ bearer | Lease / complete / logs |
| SDK worker client | `MLAIR_WORKER_TOKEN` / `ML_AIR_WORKER_TOKEN` / `ML_AIR_TOKEN` / `ML_AIR_TRACKING_TOKEN` | `sdk/worker_client.py` |
| Realtime WS | same static map / JWT | Duplicated auth module |
| Compose quickstart | `ML_AIR_TRACKING_TOKEN` default `admin-token` | deploy compose |

**Developer**

| Consumer | Typical credential | Notes |
|----------|-------------------|--------|
| Docs / curl examples | `viewer-token` / `maintainer-token` / `admin-token` | `docs/guides/*` |
| Unit / integration tests | `Bearer maintainer-token` / `admin-token` | Many API tests |
| CLI / config loader | `auth.tracking_token` → env | default `admin-token` |
| Verify scripts | `ML_AIR_TRACKING_TOKEN` / `admin-token` | e.g. `scripts/verify_phase2_run.py` |

Outbound webhook bearer env vars (`ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN`, promote webhook) are **egress secrets**, not Hub IAM principals — keep separate in migration.

### 4.3 Risk

Static tokens are **shared secrets**, often **admin-equivalent** for control-plane services, documented as **defaults**. Suitable for lab demos; incompatible with enterprise human IAM without a dual-run cutover. Migration must treat **Human**, **Automation**, and **Developer** consumers separately.

---

## 5. Existing Database

### 5.1 Auth-related tables found

| Table | Migration | Purpose |
|-------|-----------|---------|
| `auth_scope_context_overrides` | `0019_scope_context_state` | Per-`subject` preferred tenant/project + mapping_version |

### 5.2 Not present

- `users` / passwords / Argon2 hashes  
- `role_assignments`  
- `service_accounts` / token hashes  
- `refresh_sessions`  
- IAM `audit_events` (lifecycle audit exists separately for domain events)  

**Conclusion:** IAM user store must be **greenfield** relative to DB (only scope-override table is adjacent).

---

## 6. Existing Middleware / Libraries

| Component | Path | Notes |
|-----------|------|-------|
| Auth service | `api/app/domains/governance/auth_service.py` | Single source for API |
| Scope context | `api/app/domains/governance/scope_context_service.py` | Overrides + accessible projects |
| Realtime auth | `realtime/app/auth_ws.py` | **Duplicated** logic — drift risk |
| PyJWT | dependency | HS256 / RS256 |
| Hub nav access | `frontend/lib/hub-nav-access.ts` | Client-side role inference |
| App context | `frontend/lib/app-context.tsx` | Token + bootstrap |

No Starlette AuthenticationMiddleware / OAuth2PasswordBearer login flow.

---

## 7. Existing APIs (auth-relevant)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /v1/auth/whoami` | Bearer | Echo principal claims |
| `GET /v1/bootstrap/context` | Bearer | Defaults + `accessible_scopes` + effective scope |
| `POST /v1/auth/context/switch` | Bearer + authorize viewer | Persist scope override |
| Scope inspect (admin) | Bearer admin | Inspect override by subject |
| `GET /v1/runtime-config` | **Unauthenticated** (by design) | Public runtime hints |
| Almost all other `/v1/...` | Bearer + `authorize_scope(min_role=…)` | Domain APIs |
| `POST /v1/tasks/lease` (and worker complete/fail/logs) | Worker token **or** maintainer+ | External execution |
| Run logs WebSocket | Query token → Bearer | Live logs |

**Missing (target IAM):** `/login`, `/refresh`, `/logout`, `/users`, `/assignments`, `/service-accounts`, `/sessions`, IAM `/audit`.

---

## 8. Existing Frontend

| Item | Status |
|------|--------|
| Login page | **Absent** |
| Token paste UI | **Present** — Settings → Session (“Paste bearer token…”) |
| Default token | `maintainer-token` in `AppContextProvider` |
| Storage | `localStorage` `ml-air:ui-context` (tenant, project, token, …) |
| Bootstrap | `GET /bootstrap/context` on token change |
| Scope switcher | Uses token; warns if empty |
| Role-gated nav | Execution hidden for viewer (`hub-nav-access`) |
| Cookie auth | Not used |

Hub is **token-first**, not login-first.

---

## 9. Existing Configuration

From `.env.example` / compose / docs:

| Variable | Role today |
|----------|------------|
| `ML_AIR_AUTH_TOKENS_JSON` | Replace static token map |
| `ML_AIR_JWT_HS256_SECRET` | Enable HS256 JWT |
| `ML_AIR_JWT_ISSUER` / `AUDIENCE` | JWT validation |
| `ML_AIR_JWT_JWKS_URL` + cache TTL | RS256 |
| `ML_AIR_TRACKING_TOKEN` | Scheduler/executor → API |
| `ML_AIR_WORKER_TOKEN` | Unscoped lease credential |
| `ML_AIR_TOKEN` / `MLAIR_WORKER_TOKEN` | SDK / worker aliases |
| `ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN` | Outbound webhook (separate) |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` | Outbound webhook |

**No:** `ML_AIR_BOOTSTRAP_ADMIN_USER/PASSWORD`, `AUTH_MODE=login`, refresh secrets.

Config loader (`mlair/config/loader.py`) still defaults tracking token to `admin-token`.

---

## 10. Current Limitations

(Renamed from “Technical Debt”: includes product gaps as well as engineering debt.)

| Issue | Severity | Notes |
|-------|----------|--------|
| Static tokens as primary human identity | **Critical** | Shared secrets; default Hub path |
| Default `viewer-token` / `maintainer-token` / `admin-token` in docs & compose | **Critical** | Must be removed for humans in target |
| Single role per principal | **High** | Blocks multi-tenant Role Assignment |
| `ML_AIR_WORKER_TOKEN` unscoped bypass | **High** | Global lease when set |
| Duplicated auth in realtime | **High** | Drift vs API `auth_service` |
| Per-route `authorize_scope` (~100 sites) | **High** | Missed `min_role` risk |
| No login / user DB / password / sessions | **High** | Expected limitation vs Freeze (not “debt” alone) |
| Hub bearer in `localStorage` | **Medium** | XSS impact |
| JWT path underused vs static demos | **Medium** | Reusable substrate |
| Client-only nav gating | **Medium** | UX only; server remains source of truth |
| No rotate / revoke / IAM audit for tokens | **Medium** | |
| Hard-coded `*-token` in tests/docs | **Medium** | Migration surface |

---

## 11. Migration Risks

| Risk | Consumer class | Impact | Mitigation direction (post-P0) |
|------|----------------|--------|--------------------------------|
| Scheduler/executor lose API access | Automation | Runs stall | Issue SA before disabling static tracking token |
| External workers break | Automation | Lease fails | SA with `tasks:*` + scopes; dual-run |
| **SDK auth / env contract changes** | Automation | Integrators break | Versioned SDK notes; accept SA env names; dual-run |
| Hub operators lose access | Human | Demo blocked | Bootstrap Global Admin + login; Advanced paste in `dev` |
| Realtime WS auth drift | Automation / Human | Live updates fail | Unify auth library or shared contract tests |
| Test suite mass failure | Developer | CI red | Fixture factory for JWT/SA; phase out static tokens |
| Docs/curl examples obsolete | Developer | Confusion | Sweep guides after cutover |
| Webhook tokens confused with Hub IAM | Automation (egress) | Misconfiguration | Keep outbound secrets separate |
| `runtime-config` remains public | — | Info leak (low) | Out of IAM MVP unless threat model requires auth |

---

## 12. Gap Analysis (As-is → Design Freeze v1.0)

| Target (Freeze) | Current | Gap |
|-----------------|---------|-----|
| Login-first Hub | Token paste | Build `/login` + session; retire paste as primary |
| Global Admin + Role Assignments | Single `role` on token | New user + `role_assignments` model |
| Opaque refresh + revoke | None | New sessions store |
| SA permissions (no effective role) | Worker uses maintainer/admin static or unscoped worker token | SA entity + permission checks on lease path |
| Unified Domain Model | Ad-hoc Principal | Introduce Principal USER \| SA |
| Audit LOGIN/USER/SA events | Domain lifecycle audit only | IAM audit catalog |
| Argon2id passwords | N/A | User password column + policy |
| No static human bearers | Defaults everywhere | Deprecation + dual-run |
| Assignments API / UI | None | New modules |
| Bootstrap admin user | Static `admin-token` | Env seed user once |

### Keep (as-is or lightly evolve)

- Bearer transport for API and (initially) Automation  
- JWT verification machinery (HS256/JWKS) as Access Token substrate  
- `authorize_scope` **idea** (tenant/project) — evolve into assignment reach + SA scope  
- `bootstrap/context` pattern — feed from Role Assignments  
- `auth_scope_context_overrides` as UX preference (not authz source of truth)  
- Hub scope switcher UX  

### Replace

- Single-role `Principal` as long-term authz model  
- Hub default `maintainer-token` / token-first Session UX  
- Unscoped `ML_AIR_WORKER_TOKEN` behavior (replace with scoped SA)  
- Duplicated `realtime/app/auth_ws.py` implementation (share contract with API)  

### Remove (target end-state for humans / defaults)

- Default static `viewer-token`  
- Default static `maintainer-token`  
- Default static `admin-token` as Hub identity  
- Documented “paste `*-token`” as primary operator path (retain Advanced only in `dev` if needed)  

---

## 13. Recommended Migration Strategy (high level)

Aligned with Design Freeze; details belong in later migration docs — summary only:

1. **Dual-run:** Keep Automation static/env tokens + `dev` Hub Advanced paste while Human login ships.  
2. **Bootstrap Global Admin** user (env) → Hub login.  
3. **Create Role Assignments** for lab users (Vet/YOLO projects).  
4. **Issue Service Accounts** for executor/scheduler/external workers/**SDK**; update compose env.  
5. **Point Hub** to login-first; deprecate paste outside `dev`.  
6. **Remove** default static human tokens from docs/compose.  
7. **Unify realtime auth** with API auth module.  
8. **Tighten lease path** to SA permissions.  

Do **not** implement until documentation gate (P14) completes.

---

## 14. Files To Be Modified (priority for later implementation)

### P1 — Core auth plane (must land first)

| File / area | Why |
|-------------|-----|
| `api/app/domains/governance/auth_service.py` | AuthN/AuthZ evolution |
| New IAM services (users, role_assignments, sessions, SA) | Greenfield |
| New IAM routes (login/refresh/users/assignments/SA/sessions) | Greenfield |
| `api/app/api/routes/v1.py` (wire auth call sites gradually) | Enforcement |
| Alembic revisions (post-gate only) | Persistence |
| `api/tests/test_*` auth-related | Regressions |

### P2 — Consumers & Hub

| File / area | Why |
|-------------|-----|
| `frontend/lib/app-context.tsx` | Login session vs paste |
| New `/login` + Identity admin UI | Human path |
| `frontend/app/(dashboard)/settings/page.tsx` | Session tab → Advanced/dev |
| `frontend/lib/hub-nav-access.ts` | Role from assignments |
| `frontend/lib/api.ts` / realtime hook | Token source |
| `executor/main.py` | Tracking → SA |
| `scheduler/main.py` | Tracking → SA |
| `sdk/worker_client.py` | SA env contract |
| `realtime/app/auth_ws.py` | Dedupe / shared auth |
| `deploy/docker-compose*.yml`, `mlair/config/loader.py` | Env defaults |

### P3 — Docs, scripts, developer ergonomics

| File / area | Why |
|-------------|-----|
| `.env.example` | Bootstrap admin + SA vars |
| `docs/configuration.md`, `docs/guides/*` | Remove `*-token` primary path |
| `README.md` quickstart auth | Login-first |
| `scripts/external_worker_example.py`, `scripts/verify_phase2_run.py` | SA examples |
| Remaining tests hard-coding static tokens | Cleanup |

---

## Appendix A — Principal flow (as-is)

```text
Hub Settings Session
    paste token → localStorage
        ↓
AppContext token
        ↓
fetchBootstrapContext(Bearer)
        ↓
accessible_scopes / effective_scope
        ↓
All Hub API calls + Realtime WS (?token=)
        ↓
authenticate_bearer → authorize_scope
```

```text
Scheduler / Executor / SDK
    env tracking / worker token
        ↓
Bearer → API
```

```text
External worker
    ML_AIR_WORKER_TOKEN (optional global)
      OR maintainer+ bearer
        ↓
lease / complete / logs
```

---

## Appendix B — Identity Evolution

```text
TODAY
  Human: paste static/JWT bearer
  Machine: same static/JWT or ML_AIR_WORKER_TOKEN
  AuthZ: single role + tenant/project_ids on token

        ↓

TRANSITION (dual-run)
  Human: login + Access/Refresh; Advanced paste allowed in dev
  Machine: existing env tokens still accepted; SA issued in parallel
  AuthZ: new Role Assignment path for users; legacy ROLE_WEIGHT for dual-run principals

        ↓

TARGET (Design Freeze)
  Human: login-first; Global Admin + Role Assignments
  Machine: Service Account (permissions + scopes); hash-only credentials
  Remove: default viewer/maintainer/admin static Hub tokens
```

| Dimension | Today | Transition | Target |
|-----------|-------|------------|--------|
| Hub entry | Paste `maintainer-token` | Login + optional Advanced paste | Login only (prod/lab) |
| Bootstrap | Static token map in memory | Seed Global Admin user | Admin user only |
| `bootstrap/context` | Token claims | Claims and/or assignments | Role Assignments (+ admin global) |
| Automation | Tracking/worker static | Dual accept static + SA | SA only |

---

## Appendix C — Out of scope for this P0 document

- Target ERD / ADR bodies (P1+)  
- Implementation code  
- Alembic  
- Choosing cookie vs body for refresh  

---

## Approval

| Item | Status |
|------|--------|
| Current Architecture | Approved |
| Authentication / Authorization inventory | Approved |
| Token / DB / Middleware / API / Frontend / Config | Approved |
| Current Limitations + Gap (Keep/Replace/Remove) | Approved |
| Migration risks (incl. SDK) + file priorities | Approved |
| **P0 Gate** | **Closed — proceed to P1** |

---

*End of P0 Current Authentication Analysis (Approved v1.1).*
