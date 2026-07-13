# Configuration Layers (L0–L5)

**Document ID:** `docs/config/02-configuration-layers.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Rules

1. **Higher layer wins** only where explicitly allowed (L3 secrets override nothing in L4; L4 does not override L3).
2. **One read path in code** (future): a single `Settings` object—no scattered `os.getenv()`.
3. **New knobs** must be classified here **before** implementation.
4. **L4 and L5 are never merged** in APIs or documentation.

---

## L0 — Constants (compile-time)

**Audience:** Developers only. **Never** user-configurable.

Examples:

- Identity issuer `mlair-identity`
- SA permission catalog strings (`tasks:lease`, …)
- Role capability matrix keys
- HTTP API path prefixes
- Maximum payload sizes enforced at validation

Changes require code release and ADR if externally visible.

---

## L1 — Internal defaults (code)

**Audience:** Developers; SRE may override only via L2 profile bundle or L4 if explicitly exposed as **policy** (not tuning).

Examples (stay in code):

- Task lease duration default (30s)
- Lease reap interval
- Redis stream `MAXLEN` defaults
- WebSocket coalesce / block milliseconds
- JWT JWKS cache TTL
- Semantic webhook retry backoff
- OTEL service names (`mlair-api`, …)
- Login lockout **seed** defaults (until L4 row exists)

**Principle:** If 95% of Argo/Kubernetes users never tune it, it belongs here—not in `.env`.

---

## L2 — Profile (deployment class)

**Audience:** Operator at deploy time. **One primary knob:** `MLAIR_PROFILE=development|staging|production`.

Profiles are **bundled** in the `mlair` package (`mlair/profiles/*.yaml`). They select:

| Bundle aspect | Example |
|---------------|---------|
| Strictness | dataset version required; replay evidence required |
| Governance defaults | skip promote approval (dev only) |
| Observability | OTEL on/off |
| Execution topology | internal vs external workers |

`mlair.yaml` is **optional and thin**—override compose file path or hub port, not fifty tuning keys.

**Not in profile:** secrets, database URLs, artifact credentials.

---

## L3 — Deployment contract (`.env`)

**Audience:** Platform team, compose, K8s Secret mounts. Target **~20 variables** in groups A–E (see [07-deployment-contract.md](./07-deployment-contract.md)).

| Group | Contents |
|-------|----------|
| **A** Infrastructure | `DATABASE_URL`, `REDIS_URL`, MinIO/S3 endpoint, host port |
| **B** Secrets | Identity JWT, signing keys, SA bootstrap secrets, OAuth client secret |
| **C** Storage | Default artifact root / bucket |
| **D** Deployment mode | `MLAIR_PROFILE` |
| **E** Image | Image digest/tag, compose file (CLI) |

Compose-only infra (`POSTGRES_PASSWORD`, Grafana bootstrap) lives in **`deploy/.env.infra`**—not the MLAir application contract.

**Identity note:** Bootstrap admin password and SA secrets are L3. Login itself is **not** configurable off.

---

## L4 — System runtime settings (database + Hub)

**Audience:** Global Admin. **No restart** for policy changes (warm reload or next request).

**API direction:** `GET/PATCH /v1/system/settings` (to be specified; today partially `GET /v1/runtime-config`).

Examples:

| Domain | Settings |
|--------|----------|
| **Retention** | default trace days, run log days, dataset version retention |
| **Quota** | platform default ceilings |
| **Telemetry** | Grafana UI URL, observability surfaces |
| **Scheduler policy** | materialization concurrency caps (not tick intervals) |
| **Governance defaults** | promotion stage order, approval required |
| **Replay defaults** | require signed manifest, checksum evidence |
| **Security / Identity** | `IdentityPolicy`: lockout threshold, lockout duration, session TTL |
| **Hub** | default route, AI assistant enabled (if product) |

**Not L4:**

- `identity_login` feature flag — login is always on (Package 001)
- Per-tenant webhooks — L5

Seed: on first boot, L4 rows are populated from **L1 defaults** + **L2 profile bundle**.

---

## L5 — Tenant runtime settings (database + APIs)

**Audience:** Tenant admin. Enforced by APIs; never env.

Examples:

- Tenant quota overrides
- Webhook URLs and secrets (tenant-scoped)
- Dataset policy
- Promotion policy override
- Serving policy
- IAM role assignments and SA scopes (Package 001)

Link: [04-tenant-runtime-settings.md](./04-tenant-runtime-settings.md), `docs/iam/`.

---

## Anti-patterns (reject)

| Anti-pattern | Correct layer |
|--------------|---------------|
| `ML_AIR_FEATURE_IDENTITY_LOGIN` | Remove; platform core |
| `ML_AIR_LOGIN_LOCKOUT_THRESHOLD` in env | L4 IdentityPolicy |
| `ML_AIR_EVENT_STREAM_GLOBAL_MAXLEN` in `.env.example` | L1 |
| `ML_AIR_PROMOTION_STAGE_ORDER` in env | L4 or L5 |
| Duplicated `ML_AIR_*` / `MLAIR_*` for same meaning | L3 contract doc (single name) |

---

## Decision flowchart (for PRs)

```text
Is it a secret or connection string?
  yes → L3 (and 07-deployment-contract.md)
  no ↓
Is it constant across all deployments forever?
  yes → L0
  no ↓
Do 95% of operators never change it?
  yes → L1
  no ↓
Is it only about dev/staging/prod class?
  yes → L2 profile bundle
  no ↓
Is it global platform policy?
  yes → L4
  no ↓
Is it per-tenant?
  yes → L5
  else → reconsider; may belong in Package 003/004
```
