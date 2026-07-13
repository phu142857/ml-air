# ADR-012: System Runtime Settings Model

**Status:** Accepted  
**Date:** 2026-07-13  
**Series:** 002 Platform Configuration Architecture  
**Deciders:** Platform architecture  
**Depends on:** ADR-011

---

## Context

Today, global platform policy is exposed via dozens of `ML_AIR_*` environment variables and partially mirrored in `GET /v1/runtime-config` → `features.*`. Operators cannot change retention, promotion defaults, or telemetry URLs without redeploying and editing env.

We need a **system-scoped, database-backed settings document** managed by Global Admin through Hub **System Settings**, separate from tenant policy (L5).

---

## Decision

### Storage

- Persist L4 settings as a **versioned JSON document** in PostgreSQL (table name implementation detail; e.g. `system_settings` singleton row or key-value with schema version).
- **Seed** on first API startup from L1 defaults merged with active L2 profile bundle.

### API

```text
GET   /v1/system/settings     — Global Admin (subset public-read for Hub bootstrap during migration)
PATCH /v1/system/settings     — Global Admin; partial update; audited
```

During migration, `GET /v1/runtime-config` remains a **compatibility aggregate** (L4 + legacy env aliases) until deprecated in release notes.

### Schema domains (initial)

| Domain | Keys (examples) |
|--------|-----------------|
| `hub` | `default_route` |
| `telemetry` | `grafana_ui_url` |
| `retention` | trace, run_logs, dataset_versions |
| `governance` | promotion defaults, replay requirements |
| `scheduler` | execution_mode, materialization policy caps |
| `identity` | lockout threshold, lockout minutes, session TTL policy |
| `features` | **product modules only** (not identity login) |

### Resolution order (read path)

```text
L4 DB row  →  env alias (transitional)  →  L2 profile  →  L1 default
```

### Apply semantics

- Policy changes take effect **without full platform restart** (next request or worker cycle).
- JWT secret rotation remains L3 exception (ADR-011).

---

## Alternatives considered

### A. Continue env-only flags

**Rejected.** Caused current sprawl; no Hub UX.

### B. ConfigMap in Kubernetes only

**Rejected.** Excludes compose quickstart; not tenant-agnostic.

### C. Merge system + tenant in one settings table

**Rejected.** Violates cluster vs namespace boundary (ADR-011).

---

## Consequences

- Hub gains System Settings page (implementation after freeze)
- Alembic migration for L4 store (Configuration refactor phase)
- Contributor rules: new global knobs must extend L4 schema, not env
- Package 004 Governance may add keys under `governance.*` namespace

---

## References

- `docs/config/03-system-runtime-settings.md`
- `docs/config/04-tenant-runtime-settings.md`
