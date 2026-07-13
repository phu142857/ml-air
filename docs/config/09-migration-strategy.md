# Configuration Migration Strategy

**Document ID:** `docs/config/09-migration-strategy.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

Move from **~190 environment variables** (as-is `.env.example`) to the L0–L5 model **without** breaking the lab, CI, or production deploys. This is a **phased** migration—not a big-bang rename.

**Prerequisite:** Package 002 Design Freeze approved (2026-07-13).  
**Ordering:** Runs **after** Identity implementation starts only for L3-aligned secrets; full env shrink runs in **Configuration refactor** phase.

**Phase 0 (2026-07-13):** Removed `ML_AIR_FEATURE_IDENTITY_LOGIN` and `ML_AIR_LOGIN_LOCKOUT_*` from `.env.example` / compose; lockout uses L1 code defaults; `check_env_sync.py` enforces contract exclusions.

---

## As-is summary

| Section (current `.env.example`) | Count (approx) | Problem |
|----------------------------------|----------------|---------|
| 1 Host ports | 15 | Belongs in `deploy/.env.infra` |
| 2 Infrastructure | 4 | Keep (L3) |
| 3 Secrets & auth | 35+ | Mix L3 + L4 + deprecated |
| 4 Storage | 2 | Keep (L3) |
| 5 Observability | 14 | Mix L1 + L4 |
| 6 Realtime / events | 17 | Mostly L1 |
| 7 System overrides | 90+ | Should be L4/L5/L2 |
| 8–13 Integrations, CLI, CI | 30+ | Split L3 / CLI / CI |

---

## Phases

### Phase 0 — Freeze sprawl (immediate after Package 002 freeze)

- No new keys in `.env.example` except L3 groups A–E per [08-contributor-rules.md](./08-contributor-rules.md)
- Identity implementation uses only contract-listed secrets
- `check_env_sync.py` documents cap

### Phase 1 — Settings module + read aliases

- Introduce central `Settings` loader (L2 profile → L3 env → L1 defaults)
- Existing `os.getenv` reads delegate to `Settings` with **same env names** (no rename)
- `mlair config print` shows merged layers for debugging

**Phase 1 (2026-07-13):** `api/app/settings/` (`get_settings()`, feature/auth/promotion/observability bundles); core paths migrated (`runtime-config`, auth, promotion, readiness, webhooks); `mlair config print` includes `_layers` (L1/L2/L3).

### Phase 2 — L4 system settings table

- Alembic: `system_settings` (or extend existing runtime config store)
- Seed from L2 profile on first boot
- Migrate `GET /v1/runtime-config` `features.*` to L4 keys
- Hub System Settings UI (read-only first, then PATCH)

**Phase 2 (2026-07-13):** Migration `0044_system_settings`; seed on API startup; `GET/PATCH /v1/system/settings` (global admin); Settings loader reads L4 overlay (env → L4 → profile → L1); Hub **System (L4)** tab — PATCH form for hub, identity, governance, quota defaults, webhooks (global admin).

### Phase 3 — Shrink `.env.example`

- Move groups A–E only into committed example (~20 vars)
- Move compose ports to `deploy/.env.infra.example`
- Move CLI vars to `docs/cli/commands.md` only
- Deprecation notice on removed keys (release notes)

**Phase 3 (2026-07-13):** `.env.example` reduced to **27** L3 contract keys (cap 30); `deploy/.env.infra.example` holds ports, bootstrap creds, and transitional env aliases; `check_env_sync.py` validates union; `mlair start` merges both into `.env`.

### Phase 4 — Remove env aliases

- Major version or announced release: env aliases for L4 keys stop working
- CI smoke uses `identity_smoke_token` + profile (already started)

**Phase 4 (2026-07-13):** Settings loader uses **L4-first** policy reads when `system_settings` is loaded (`use_l4_first_policy`); compose API services no longer inject feature/governance env; `deploy/.env.infra.example` trimmed to compose-only keys (~64); rollback via `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1`. Scheduler/executor/realtime still read direct `os.getenv` for L1 tuning until a later pass.

### Phase 5 — Tenant L5 consolidation

- Align quota, webhooks, promotion with Package 004 Governance freeze
- Remove duplicate tenant policy env if any remain

**Phase 5 (2026-07-13):** L4 `governance.quota_defaults` and `governance.webhook_allowed_hosts` seed in `system_settings`; `tenant_quota_service` reads ceilings via `platform_policy` (L4-first); quota enforcement uses `Settings.features.tenant_quota_enforce`; global webhook allowlist from L4 (env alias only when L4 row lacks key or `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1`). Per-tenant overrides remain in `tenant_quotas` (L5) + Hub tenant settings.

### Post-refactor — Worker Settings bridge (2026-07-13)

Scheduler / executor / realtime read policy flags via `api/app/settings/worker.py` (OTel, event stream, replay gates, manifest strict lifecycle). L3 URLs/secrets and L1 tick intervals remain env. Worker images include `api` + `mlair` on `PYTHONPATH`.

---

## Identity package interaction

| Identity artifact | Migration note |
|-------------------|----------------|
| Bootstrap admin password | Stays L3 |
| SA bootstrap secrets | Stays L3 |
| Lockout threshold | Move env → L4 `identity.lockout` |
| `ML_AIR_FEATURE_IDENTITY_LOGIN` | **Delete** — login always on |
| `ML_AIR_LEGACY_STATIC_TOKENS` | Time-bounded; not in target `.env.example` |

Identity implementation may ship before Phase 3 env shrink **if** new vars comply with frozen `07-deployment-contract.md`.

---

## Rollback

- Through Phase 3: read path was env → L4 → profile → L1 for policy keys
- Phase 4+: L4-first when `system_settings` exists; set `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1` to restore env aliases
- Do not drop identity tables or system_settings on rollback
- Profile `development` may re-enable legacy auth flags internally until cutover complete (not Hub toggle)

---

## Definition of done (Configuration refactor)

| # | Criterion |
|---|-----------|
| 1 | `.env.example` ≤ 30 active vars (groups A–E) |
| 2 | No feature flags in `.env.example` |
| 3 | `GET /v1/system/settings` serves L4 document |
| 4 | Contributor rules enforced in CI |
| 5 | `docs/configuration.md` aligned with Package 002 |
| 6 | Smoke / CI pass with `MLAIR_PROFILE=development` only |

---

## Non-goals

- Renaming all `ML_AIR_*` variables in one release
- Migrating Helm charts (Package 005)
- Execution semantics changes (Package 003)
