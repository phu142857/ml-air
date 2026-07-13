# Deployment Contract (`.env`)

**Document ID:** `docs/config/07-deployment-contract.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

The **deployment contract** is the only environment surface most operators need. Target size: **~20 variables** in five groups (A–E). Everything else moves to L1 (code), L2 (profile), or L4/L5 (Hub settings).

The current `.env.example` (~190 vars) is **legacy**; see [09-migration-strategy.md](./09-migration-strategy.md).

---

## Contract groups

### A — Infrastructure

Connection strings and host wiring (non-secret or composite URLs).

| Variable | Required | Notes |
|----------|----------|-------|
| `ML_AIR_DATABASE_URL` | yes | PostgreSQL |
| `ML_AIR_REDIS_URL` | yes | Redis |
| `ML_AIR_API_BASE_URL` | compose | Internal service URL (scheduler → API) |
| `MLAIR_PORT` | optional | Host port for all-in-one (default 8080) |

MinIO/S3 endpoint may join here when not embedded in artifact URL.

**Compose infra** (host port mappings, `POSTGRES_PASSWORD`) → `deploy/.env.infra`, not this contract.

---

### B — Secrets

| Variable | Required | Notes |
|----------|----------|-------|
| `ML_AIR_IDENTITY_JWT_SECRET` | yes | Human access JWT |
| `ML_AIR_BOOTSTRAP_ADMIN_PASSWORD` | first boot | Global Admin seed; rotate via Hub after |
| `ML_AIR_SA_SCHEDULER_SECRET` | yes | Platform SA bootstrap |
| `ML_AIR_SA_EXECUTOR_SECRET` | yes | Platform SA bootstrap |
| `ML_AIR_SA_YOLO_WORKER_SECRET` | if external worker | Worker SA bootstrap |
| `ML_AIR_SA_VET_WORKER_SECRET` | if external worker | Worker SA bootstrap |
| `ML_AIR_MANIFEST_SIGNING_KEY` | yes (dev) | Or managed key file path |
| `ML_AIR_JWT_HS256_SECRET` | legacy path | Remove when legacy JWT removed |

Optional: OAuth client secret, webhook bearer tokens at platform level (prefer L5).

**Not in contract:** lockout threshold, feature flags, tuning intervals.

---

### C — Storage

| Variable | Required | Notes |
|----------|----------|-------|
| `ML_AIR_DATASET_ARTIFACT_ROOT` | yes | `file://` or `s3://` |
| `ML_AIR_DEFAULT_MODEL_ARTIFACT_ROOT` | yes | Model artifacts |

---

### D — Deployment mode

| Variable | Required | Notes |
|----------|----------|-------|
| `MLAIR_PROFILE` | optional | `development` (default), `staging`, `production` |

Single knob selects L2 bundle. Replaces dozens of per-feature env flags.

---

### E — Image / packaging

| Variable | Required | Notes |
|----------|----------|-------|
| `MLAIR_IMAGE` | optional | All-in-one image tag |
| `MLAIR_API_IMAGE` | microservices | Per-service overrides |
| `MLAIR_SCHEDULER_IMAGE` | microservices | |
| `MLAIR_EXECUTOR_IMAGE` | microservices | |
| `MLAIR_FRONTEND_IMAGE` | microservices | |
| `MLAIR_REALTIME_IMAGE` | microservices | |
| `COMPOSE_FILE` | CLI | Compose file path |

Production: pin digest, not `:latest`.

---

## Explicitly excluded from contract

The following **must not** appear in the target `.env.example`:

| Excluded | Target layer |
|----------|--------------|
| `ML_AIR_FEATURE_*` | L4 or remove |
| `ML_AIR_LOGIN_LOCKOUT_*` | L4 IdentityPolicy |
| `ML_AIR_LEGACY_STATIC_TOKENS` | Migration-only; not in target example |
| `ML_AIR_TASK_LEASE_SECONDS` | L1 |
| `MLAIR_REALTIME_*` tuning | L1 |
| `ML_AIR_PROMOTION_*` | L4/L5 |
| `ML_AIR_TENANT_ID`, `ML_AIR_TOKEN` | CLI helpers; not deploy contract |
| `ML_AIR_RUN_DB_INTEGRATION_TESTS` | CI only |
| `OTEL_SERVICE_NAME_*` | L1 constants |

---

## Frontend wiring (build / runtime)

Browser-facing URLs may remain as `NEXT_PUBLIC_*` (Next.js convention)—grouped separately in docs, not counted toward the ~20 server contract:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_MLAIR_REALTIME_WS`

Injected by compose at deploy time.

---

## Validation

`scripts/check_env_sync.py` will be updated after freeze to:

1. Assert compose refs ⊆ `.env.example` keys
2. Assert `.env.example` size ≤ agreed cap (~30 lines of active vars)
3. Fail CI if new `ML_AIR_*` added to example without Package 002 classification PR

---

## ADR

[ADR-013: Deployment contract and secrets](../adr/013-deployment-contract-and-secrets.md)
