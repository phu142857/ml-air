# P5 — UI Flow & Wireframes (Identity)

**Document ID:** `docs/iam/06-ui-flow-wireframe.md`  
**Phase:** P5 – UI  
**Status:** **Approved — UI Freeze v1.0** (Design Freeze v1.0)  
**Depends on:** P4 REST (`05-rest-api-specification.md`)  

**This document answers:** *What does the Hub operator experience look like (flows + wireframes)?*  
**This document does not answer:** React components, CSS, or API implementation.

> Part of **Identity Design Freeze v1.0**. Material UX contract changes require a new ADR.

---

## 0. Boundary

| Concern | Doc |
|---------|-----|
| REST contracts | `05` |
| **Screens & flows** | **This document** |
| Capability labels | `07` |
| Who sees which button | `09` |

**Hub principle:** Login-first. Paste-static-token is not the target primary path.

---

## 1. Screen inventory

| Screen | Audience | Primary actions |
|--------|----------|-----------------|
| Login | Anyone | username/password → session |
| App shell (post-login) | Authenticated user | nav; scope context from assignments |
| Users list | Admin | create / open user |
| User detail + Assignments | Admin | state, admin flag, **assignment editor** |
| Service Accounts list | Admin | create / open SA |
| SA detail | Admin | permissions, scopes, issue/rotate/revoke secret |
| Sessions | Admin / self | revoke one / all |
| Audit | Admin | filter / inspect (read-only) |

---

## 2. Login flow

```text
[ Login ]
  Username ________
  Password ________
  [ Sign in ]

        ↓ success
  Store access (memory/session) + refresh (secure storage policy)
        ↓
  GET /v1/auth/me → shell
```

Wireframe (text):

```text
┌─────────────────────────────────────┐
│              MLAir Hub              │
│                                     │
│   Username  [________________]      │
│   Password  [________________]      │
│                                     │
│           [ Sign in ]               │
│                                     │
│   error: Invalid credential / Locked│
└─────────────────────────────────────┘
```

Locked → show message mapped from `ACCOUNT_LOCKED` (423). No “paste bearer” on this screen.

---

## 3. Post-login shell

```text
┌──────────┬──────────────────────────────────────┐
│ Nav      │  Workspace                            │
│ Pipelines│  Tenant / Project picker              │
│ Runs     │  (options = union of assignments;     │
│ …        │   Admin = all)                        │
│──────────│                                       │
│ Admin*   │  content                              │
│  Users   │                                       │
│  SAs     │                                       │
│  Audit   │                                       │
└──────────┴──────────────────────────────────────┘
* Admin nav only if is_global_admin
```

Scope picker never invents tenants outside `/me` reach.

---

## 4. Users → Assignment editor (core UX)

### 4.1 Users list

```text
┌ Users ──────────────────────── [ + Create user ] ┐
│ username     state      admin   actions           │
│ alice        active     no      [Open]            │
│ bob          locked     no      [Open]            │
└───────────────────────────────────────────────────┘
```

### 4.2 User detail + Role Assignment

**Idea:** Assignment is Tenant → Role → Projects (ALL toggle **or** selected projects). Not a `role` dropdown on the user row alone.

```text
┌ User: alice ──────────────────────────────────────┐
│ State [active ▾]   Global admin [ ]               │
│ [ Reset password ]  [ Disable ]  [ Delete ]       │
│                                                    │
│ Role Assignments                    [ + Add ]      │
│ ┌────────────────────────────────────────────────┐ │
│ │ Tenant A                                       │ │
│ │ Role  (•) Maintainer  ( ) Viewer               │ │
│ │ Projects  [x] All projects                     │ │
│ │           (project list disabled when All on)  │ │
│ │                                    [ Remove ]  │ │
│ ├────────────────────────────────────────────────┤ │
│ │ Tenant B                                       │ │
│ │ Role  ( ) Maintainer  (•) Viewer               │ │
│ │ Projects  [ ] All projects                     │ │
│ │           [x] proj-x  [x] proj-z  [ ] proj-y   │ │
│ │                                    [ Remove ]  │ │
│ └────────────────────────────────────────────────┘ │
│                         [ Save assignments ]       │
└────────────────────────────────────────────────────┘
```

**Save** → `PUT /v1/users/{id}/assignments` (replace set).  
**Add** → local card then save, or `POST` one then refresh.  
Duplicate (tenant, role, selection) → surface `DUPLICATE_ASSIGNMENT`.

```text
User
  ↓
Assignment card(s)
  ↓
Tenant
  ↓
Role (maintainer | viewer)
  ↓
Projects: All  OR  Selected[]
```

---

## 5. Service Account flows

### 5.1 List / create

```text
┌ Service Accounts ──────────── [ + Create ] ───────┐
│ name           state     last used   actions       │
│ worker-vet     active    …           [Open]        │
└────────────────────────────────────────────────────┘
```

### 5.2 Detail: permissions, scopes, secrets

```text
┌ SA: worker-vet ───────────────────────────────────┐
│ State: active          [ Revoke account ]         │
│                                                    │
│ Permissions (checkboxes from catalog 08)          │
│ [x] tasks:lease  [x] logs:write  …   [ Save ]     │
│                                                    │
│ Scopes                                            │
│ Tenant A · All projects              [Remove]     │
│ Tenant B · proj-x, proj-z            [Remove]     │
│ [ + Add scope ]                                    │
│                                                    │
│ Credentials                                       │
│ token_id     created     revoked    [Revoke key]  │
│ abc…         …           —                        │
│ def…         …           —                        │
│ [ Issue secret ]  [ Rotate ]                       │
└────────────────────────────────────────────────────┘
```

**Issue / Rotate** → modal show-once secret + copy warning; never shown again.

```text
┌ New secret (shown once) ─────────────────────────┐
│ token_id: abc…                                    │
│ secret:   ********************************        │
│ [ Copy ]     Close = cannot recover plaintext     │
└───────────────────────────────────────────────────┘
```

Rotate: new key active; old keys remain until admin revokes (P3 window).

---

## 6. Sessions

```text
┌ Sessions (user alice) ──────────── [ Revoke all ] ┐
│ id     created    last used   ip      [Revoke]    │
└────────────────────────────────────────────────────┘
```

Self: account menu → Logout / Logout all devices → Auth API.

---

## 7. Audit

```text
┌ Audit ── from/to · actor · action · [Filter] ─────┐
│ time   actor   action   target   result            │
│ …      alice   login    —        success           │
│ (row expand → payload preview, read-only)          │
└────────────────────────────────────────────────────┘
```

No edit/delete controls.

---

## 8. Error presentation (UI)

Map `error.code` from `10-error-model.md` to toast/banner copy. Do not invent ad-hoc strings per screen when a code exists.

---

## 9. Explicitly out of P5

- Component library / Tailwind choices  
- Exact pixel mockups  
- Frontend state management  
- Implementation PRs  

---

## 10. Gate checklist (P5) — CLOSED

- [x] Login-first flow accepted  
- [x] Assignment editor (Tenant → Role → All/Selected) accepted  
- [x] SA issue / rotate / revoke UX accepted  
- [x] Sessions + Audit read-only accepted  
- [x] No code in design phase  

**P5 UI Freeze v1.0.** See `DESIGN-FREEZE.md`.

---

## 11. References

- `05-rest-api-specification.md`  
- `03-domain-model.md` · ADR-008  

---

*P5 UI — wireframes only.*
