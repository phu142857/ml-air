# System Runtime Settings (L4)

**Document ID:** `docs/config/03-system-runtime-settings.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

**System runtime settings** are global platform policy stored in the database and managed through **Hub System Settings** (Global Admin)—analogous to GitHub Enterprise instance settings or Kubernetes cluster configuration.

They are **not**:

- Environment variables in `.env`
- Per-tenant policy (see L5)
- Feature flags for core platform capabilities (e.g. login)

---

## Management

| Concern | Target behavior |
|---------|-----------------|
| **Read** | Authenticated Global Admin; subset public-read for Hub bootstrap (`runtime-config` compatibility during migration) |
| **Write** | Global Admin only; audited |
| **Apply** | No full platform restart; settings effective on next request or background worker cycle |
| **Seed** | First API startup: insert defaults from L1 + active L2 profile |

---

## Domain catalog (initial)

### Platform

| Key area | Examples | Notes |
|----------|----------|-------|
| `hub.default_route` | `datasets`, `lifecycle` | Hub entry redirect |
| `telemetry.grafana_ui_url` | URL | Already partially in runtime-config |

### Retention

| Key area | Examples |
|----------|----------|
| `retention.trace_spans` | enabled, days, sweep interval |
| `retention.run_logs` | enabled, days |
| `retention.dataset_versions` | default max versions |

### Governance defaults

| Key area | Examples |
|----------|----------|
| `governance.promotion` | stage order, approval stages, skip stages (dev profile may seed permissive defaults) |
| `governance.rollback` | enabled, requires approval |
| `governance.replay` | require artifact evidence, checksum, signed manifest |

### Scheduler policy (not tuning)

| Key area | Examples |
|----------|----------|
| `scheduler.materialization` | max concurrent jobs per tick (policy) |
| `scheduler.execution_mode` | `internal` \| `external` |

Intervals (tick seconds, lease seconds) remain **L1** unless promoted by ADR.

### Security / Identity policy

| Key area | Examples |
|----------|----------|
| `identity.lockout` | threshold, duration minutes |
| `identity.session` | refresh TTL policy |

**Not configurable:** disabling login; static human tokens (removed by Package 001).

### Feature exposure (product modules only)

Optional modules may be toggled here—**not** core auth:

| Allowed L4 toggle | Not allowed |
|-------------------|-------------|
| Dataset Hub V2 UI | Identity login |
| Scope debug panel (dev) | JWT validation |
| Serving slots HTTP | Role assignment model |

---

## API sketch (freeze target)

```text
GET    /v1/system/settings
PATCH  /v1/system/settings          (partial update, schema-versioned)

GET    /v1/runtime-config           (legacy aggregate; deprecate after migration)
```

Response shape: versioned JSON document with `schema_version`, `settings` object, `updated_at`.

---

## Migration from env

Current `ML_AIR_*` flags exposed via `GET /v1/runtime-config` → `features.*` migrate to L4 keys with:

1. Read L4 row if present
2. Else fall back to L2 profile bundle
3. Else L1 default

Env vars become **aliases** during transition (see [09-migration-strategy.md](./09-migration-strategy.md)); removed after cutover.

---

## ADR

[ADR-012: System runtime settings model](../adr/012-system-runtime-settings.md)
