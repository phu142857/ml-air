# MLAir Control Plane — Configuration Architecture Contract

**Status:** Implemented (P0–P2 control plane configuration stack).  
**Version:** `control-plane-config-v1`  
**Last updated:** 2026-08-22

This document defines the **configuration layer** of the MLAir Control Plane. It is intentionally written **before** P0 code so that Policy Engine, Lifecycle FSM, Environment RBAC, and Hub UI share one contract.

**Related:** [Architecture overview](./README.md) · [Lifecycle formal model](../concepts/lifecycle-formal-model.md) · [Deploy-time configuration (L0–L5)](../configuration.md)

---

## 1. Purpose

MLAir evolves as:

```text
User → Hub → Configuration + Policy → Control Plane → Runtime → Observability → Events → Automation → Lifecycle
```

The **configuration layer** answers:

> *What values govern behavior at this scope, for this resource, in this environment?*

It does **not** answer:

- *Is this capability installed/enabled?* → **Feature flag**
- *Should we trigger an action now?* → **Policy**
- *Is this lifecycle transition legal?* → **Lifecycle FSM**
- *Who may perform this action?* → **RBAC**

---

## 2. Four-layer separation (non-negotiable)

| Layer | Question | Example | Mutability | Consumer |
|-------|----------|---------|------------|----------|
| **Feature flag** | Capability on/off for this installation? | `multi_cluster`, `experiments_enabled` | L4 / env / profile | Router, UI nav, service branches |
| **Configuration** | How does it behave when enabled? | `monitoring.drift.threshold = 0.10` | Scoped entries + inheritance | Resolver, Hub forms, automation inputs |
| **Policy** | When/why should an action occur? | `IF drift > threshold THEN emit DriftDetected` | Policy rules (separate store) | Policy engine, closed-loop orchestrator |
| **Lifecycle FSM** | Is transition / action allowed? | `Evaluated → ApprovalPending` | State machine guards | Registry, approval, promote APIs |

### Resolver boundary

```python
# ConfigurationResolver — NO business logic
effective = resolver.resolve(key="monitoring.drift.threshold", context=ctx)

# PolicyEngine — uses configuration + telemetry; NO direct DB config reads
decision = policy_engine.evaluate(context=ctx, configuration=effective)

# LifecycleEngine — authorization of transitions
lifecycle_engine.assert_transition(model_version, target_state, principal=principal)
```

**Rule:** `ConfigurationResolver` MUST NOT import policy, lifecycle, or closed-loop services.

---

## 3. Scope model

### 3.1 Scope hierarchy (resolution order)

Resolution walks **from broad to narrow**. The **effective value** is the **most specific non-null** entry in the chain.

```text
Global          (installation / L4 defaults)
   ↓
Project         (tenant_id + project_id)
   ↓
Environment     (environment_id within project — e.g. production, staging)
   ↓
Resource        (resource_type + resource_id — e.g. model, dataset, pipeline)
   ↓
Effective Configuration (+ provenance chain)
```

### 3.2 Scope identifiers

| Scope | `scope_level` | Required identifiers |
|-------|---------------|-------------------|
| Global | `global` | none |
| Project | `project` | `tenant_id`, `project_id` |
| Environment | `environment` | `tenant_id`, `project_id`, `environment_id` |
| Resource | `resource` | `tenant_id`, `project_id`, `environment_id` (optional), `resource_type`, `resource_id` |

`environment_id` is **optional** at resource scope. When omitted at resolve time, environment layer is skipped (value `null` in chain).

### 3.3 Resource types (v1)

| `resource_type` | `resource_id` | Notes |
|-----------------|---------------|-------|
| `model` | `model_id` | Primary P0 target |
| `dataset` | `dataset_id` | P1 |
| `pipeline` | `pipeline_id` | P1 |
| `project` | `project_id` | Alias for project-scoped bundle without environment |

New types require schema registration; unknown types are rejected at write time.

---

## 4. Domain model

### 4.1 ConfigurationEntry

A **ConfigurationEntry** is one keyed value at one scope. It is versioned and auditable.

| Field | Type | Description |
|-------|------|-------------|
| `entry_id` | UUID | Primary key |
| `key` | string | Dot-namespaced key (see §5) |
| `value` | typed JSON | Resolved scalar or small object |
| `value_type` | enum | `boolean`, `number`, `string`, `duration`, `json` |
| `scope_level` | enum | `global`, `project`, `environment`, `resource` |
| `tenant_id` | string? | Required except `global` |
| `project_id` | string? | Required for project/environment/resource |
| `environment_id` | string? | Required for `environment`; optional on `resource` |
| `resource_type` | string? | Required for `resource` |
| `resource_id` | string? | Required for `resource` |
| `enabled` | boolean | When `false`, entry is ignored (inherits from below) |
| `version` | int | Monotonic per (scope, key); increments on each write |
| `metadata` | json | `label`, `description`, `unit`, `schema_ref` (non-secret) |
| `created_by` | user_id? | Actor |
| `updated_by` | user_id? | Actor |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Secrets:** Configuration entries MUST NOT store secrets (passwords, API keys, JWT signing material). Use secret management; UI may reference `secret_ref` in metadata only (P1).

### 4.2 ConfigurationOverride semantics

An override is a **ConfigurationEntry** at a narrower scope that **replaces** the inherited value for that key.

| State | Meaning |
|-------|---------|
| **No entry** | Inherit from parent scope |
| **Entry with value** | Override; effective at this scope and below |
| **`enabled: false`** | Explicit disable; treat as *no local value* (inherit) — distinct from `null` value |
| **`value: null` + `enabled: true`** | **Explicit inherit** (reset override): removes local contribution; provenance shows `inherited: true` |

### 4.3 EffectiveConfiguration

Result of resolution for one key in one context.

| Field | Description |
|-------|-------------|
| `key` | Configuration key |
| `value` | Effective typed value |
| `value_type` | Type of `value` |
| `source` | Winning scope (`scope_level`, ids, `entry_id`, `version`) |
| `inherited` | `true` if winning value comes from an ancestor scope |
| `chain` | Ordered list of contributions per scope level (for UI + audit) |
| `resolved_at` | Timestamp |

### 4.4 ConfigurationProvenance (chain item)

Each item in `chain[]`:

```json
{
  "scope_level": "project",
  "tenant_id": "retail",
  "project_id": "vision-qa",
  "environment_id": null,
  "resource_type": null,
  "resource_id": null,
  "value": 0.8,
  "entry_id": "…",
  "version": 3,
  "enabled": true,
  "contributes": true
}
```

- `contributes: true` — this scope supplied the winning value.
- `contributes: false` — no entry or disabled; `value` is `null`.

### 4.5 Relationship to Policy (future)

| Concept | Store | Evaluated by |
|---------|-------|--------------|
| Configuration | `cp_configuration_entries` (+ L4 adapter) | `ConfigurationResolver` |
| Policy rule | `cp_policy_rules` (existing schema, extended in P1) | `PolicyEngine` |

Policy rules **reference** configuration keys by name; they do not duplicate threshold values.

---

## 5. Configuration key namespace (v1)

Keys use dot notation: `<domain>.<area>.<name>`.

| Prefix | Domain | Examples |
|--------|--------|----------|
| `platform.*` | Install-wide (maps from L4) | `platform.hub.default_route` |
| `mlops.experiment.*` | Experiment management | `mlops.experiment.enabled` (flag-like but scoped) |
| `monitoring.drift.*` | Drift detection | `monitoring.drift.enabled`, `monitoring.drift.threshold`, `monitoring.drift.method` |
| `monitoring.slo.*` | SLO defaults | `monitoring.slo.check_interval` |
| `automation.retrain.*` | Auto retrain | `automation.retrain.enabled`, `automation.retrain.triggers` |
| `automation.deploy.*` | Auto deploy | `automation.deploy.enabled`, `automation.deploy.require_approval` |
| `automation.rollback.*` | Auto rollback | `automation.rollback.enabled`, `automation.rollback.error_threshold` |
| `governance.approval.*` | Approval defaults | `governance.approval.two_step_required` |
| `governance.evaluation.*` | Evaluation gates | `governance.evaluation.require_before_promote` |

**Registry:** `api/app/domains/configuration/key_registry.py` (P0) — validates keys, types, defaults, and allowed scopes.

**Example effective response** (contract from product spec):

```json
{
  "key": "monitoring.drift.threshold",
  "value": 0.8,
  "value_type": "number",
  "source": {
    "scope_level": "project",
    "tenant_id": "retail",
    "project_id": "vision-qa",
    "entry_id": "e-123",
    "version": 2
  },
  "inherited": false,
  "chain": [
    { "scope_level": "global", "value": 0.7, "contributes": false },
    { "scope_level": "project", "value": 0.8, "contributes": true },
    { "scope_level": "environment", "value": null, "contributes": false },
    { "scope_level": "resource", "value": null, "contributes": false }
  ]
}
```

---

## 6. Resolution algorithm

### 6.1 ResolutionContext

```python
@dataclass(frozen=True)
class ResolutionContext:
    tenant_id: str | None = None
    project_id: str | None = None
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
```

### 6.2 Precedence rules

1. **Narrower scope wins** over broader scope for the same key.
2. Within a scope, **highest `version`** wins (only one active row per scope+key enforced by unique constraint).
3. **`enabled: false`** → scope contributes nothing (skip).
4. **`value: null` with explicit reset** → scope contributes nothing; marks override removed.
5. **Missing entry** → scope contributes nothing.
6. **Global fallback** comes from (in order):
   - `cp_configuration_entries` where `scope_level = global`
   - L4 `system_settings` adapter (read-only mapping for known keys)
   - Key registry default

### 6.3 Conflict resolution

| Situation | Resolution |
|-----------|--------------|
| Two entries same scope+key | Rejected at write (unique constraint); bump `version` on update |
| Resource + environment both set | Both appear in chain; resource wins if non-null |
| Type mismatch at narrower scope | Rejected at write (validation against registry) |
| Unknown key | Rejected at write; resolve returns `key_not_registered` error |

### 6.4 Delete / inherit semantics

| Operation | HTTP | Effect |
|-----------|------|--------|
| **Set override** | `PUT` entry at scope | Upsert; `version++` |
| **Reset to inherit** | `DELETE …/overrides/{key}` or `PUT` with `reset: true` | Remove entry OR write `value: null, enabled: true` per implementation; provenance shows inheritance |
| **Disable local** | `PUT` with `enabled: false` | Scope ignored; parent value applies |

**UI label mapping:**

| Provenance | UI badge |
|------------|----------|
| Global default / L4 | `default` |
| Ancestor scope | `inherited` |
| Current scope entry | `overridden` |
| Policy-derived display only | `policy-derived` (P1; policy does not write config) |
| Feature flag off | `disabled` (capability gate, not config inherit) |

---

## 7. Component contracts (P0)

### 7.1 ConfigurationRepository

**Not CRUD-only.** Repository is optimized for **scoped reads along the resolution chain**.

Required operations:

```python
class ConfigurationRepository:
    def fetch_chain(
        self,
        *,
        key: str,
        context: ResolutionContext,
    ) -> list[ConfigurationEntry]: ...

    def upsert_entry(
        self,
        *,
        entry: ConfigurationEntry,
        actor_id: str,
    ) -> ConfigurationEntry: ...

    def delete_override(
        self,
        *,
        key: str,
        context: ResolutionContext,
        actor_id: str,
    ) -> None: ...

    def list_entries_at_scope(
        self,
        *,
        scope_level: str,
        tenant_id: str | None,
        project_id: str | None,
        environment_id: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        prefix: str | None = None,
    ) -> list[ConfigurationEntry]: ...

    def history(
        self,
        *,
        key: str,
        context: ResolutionContext,
        limit: int = 50,
    ) -> list[ConfigurationEntry]: ...
```

Persistence table: **`cp_configuration_entries`** (new migration `0060_configuration_entries.py`).

Unique constraint: `(scope_level, tenant_id, project_id, environment_id, resource_type, resource_id, key)` with NULLS NOT DISTINCT (PostgreSQL 15+) or sentinel null handling.

Append-only **`cp_configuration_entry_log`** for audit replay (optional P0; minimum is domain audit event).

### 7.2 ConfigurationResolver

```python
class ConfigurationResolver:
    def resolve(
        self,
        key: str,
        *,
        context: ResolutionContext,
    ) -> EffectiveConfiguration: ...

    def resolve_many(
        self,
        keys: list[str],
        *,
        context: ResolutionContext,
    ) -> dict[str, EffectiveConfiguration]: ...

    def resolve_prefix(
        self,
        prefix: str,
        *,
        context: ResolutionContext,
    ) -> dict[str, EffectiveConfiguration]: ...
```

Implementation notes:

- Pure function over repository + L4 adapter + key registry.
- No side effects.
- No policy/lifecycle imports.
- Cache: optional read-through per request scope (P0: no distributed cache).

### 7.3 EffectiveConfigurationService

Application façade for HTTP layer:

```python
class EffectiveConfigurationService:
    def get_effective(
        self,
        *,
        context: ResolutionContext,
        keys: list[str] | None = None,
        prefix: str | None = None,
    ) -> EffectiveConfigurationBundle: ...

    def put_override(
        self,
        *,
        context: ResolutionContext,
        key: str,
        value: Any,
        actor_id: str,
    ) -> EffectiveConfiguration: ...

    def reset_override(
        self,
        *,
        context: ResolutionContext,
        key: str,
        actor_id: str,
    ) -> EffectiveConfiguration: ...
```

Emits domain audit + semantic event on mutation (§9).

### 7.4 L4 adapter (read-only bridge)

Maps subset of L4 `system_settings` to global configuration keys for resolution chain bottom. Does **not** write back on P0 override (dual-read only).

| L4 path | Config key |
|---------|------------|
| `features.*` | **Not mapped** — remains feature flag |
| `governance.promotion.stage_order` | `governance.promotion.stage_order` |
| `runtime.task_execution_mode` | `platform.runtime.task_execution_mode` |

Full mapping table maintained in `l4_configuration_adapter.py`.

---

## 8. API contract (v1)

Base path follows existing convention: `/v1/tenants/{tenant_id}/projects/{project_id}/…`

### 8.1 Effective configuration (read)

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/configuration/effective
```

Query parameters:

| Param | Required | Description |
|-------|----------|-------------|
| `environment_id` | no | Environment layer |
| `resource_type` | no | e.g. `model` |
| `resource_id` | no | e.g. model UUID |
| `keys` | no | Comma-separated keys; omit for none |
| `prefix` | no | e.g. `monitoring.drift` |

Response `200`:

```json
{
  "context": {
    "tenant_id": "retail",
    "project_id": "vision-qa",
    "environment_id": "production",
    "resource_type": "model",
    "resource_id": "m-1"
  },
  "items": [
    { "key": "monitoring.drift.threshold", "value": 0.8, "value_type": "number", "source": { "…": "…" }, "inherited": false, "chain": [ "…" ] }
  ],
  "resolved_at": "2026-08-22T10:00:00Z"
}
```

### 8.2 Scoped overrides (write)

```http
PUT /v1/tenants/{tenant_id}/projects/{project_id}/configuration/overrides
```

Body:

```json
{
  "scope_level": "resource",
  "environment_id": "production",
  "resource_type": "model",
  "resource_id": "m-1",
  "entries": [
    { "key": "monitoring.drift.threshold", "value": 0.05, "enabled": true }
  ]
}
```

Requires `maintainer` or higher; resource scope may require model owner stakeholder (P1).

### 8.3 Reset override

```http
DELETE /v1/tenants/{tenant_id}/projects/{project_id}/configuration/overrides/{key}
```

Query: same scope identifiers as GET.

### 8.4 Configuration history

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/configuration/history
```

Query: `key`, scope params, `limit`, `cursor`.

### 8.5 Model convenience (thin wrapper)

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/configuration/effective
```

Equivalent to GET effective with `resource_type=model`, `resource_id={model_id}`.

**Authorization:** `authorize_scope` + future environment dimension (P2). P0: project scope RBAC only.

---

## 9. Audit and events

### 9.1 Domain audit

Every configuration mutation emits a **domain audit** record:

| Field | Value |
|-------|-------|
| `action` | `configuration.override.set` \| `configuration.override.reset` |
| `resource_type` | `configuration_entry` |
| `resource_id` | `{entry_id}` |
| `metadata` | `key`, `scope_level`, `old_value`, `new_value`, `version`, full `context` |

Uses existing `domain_audit_events` pipeline — no new audit store.

### 9.2 Semantic / realtime event

Publish `configuration.updated` (new `EventType` in `realtime_events.py`):

```json
{
  "type": "configuration.updated",
  "tenant_id": "…",
  "project_id": "…",
  "payload": {
    "key": "monitoring.drift.threshold",
    "scope_level": "resource",
    "resource_type": "model",
    "resource_id": "m-1",
    "version": 4
  }
}
```

Hub invalidates effective-config queries on this type.

### 9.3 Metrics (P0)

| Metric | Labels |
|--------|--------|
| `mlair_configuration_resolve_total` | `key`, `scope_level` |
| `mlair_configuration_change_total` | `action`, `scope_level` |

---

## 10. Migration strategy (legacy → cp_configuration_entries)

**Principle:** Dual-read, single-write to new store. No big-bang data migration required for P0.

| Legacy store | Maps to (read adapter) | Write path P0 | Write path P1+ |
|--------------|------------------------|---------------|----------------|
| L4 `system_settings` | Global scope keys | L4 admin UI only | Optional sync job |
| `data_governance_policies` | `governance.data.*` project scope | Existing API + adapter | Deprecate JSON blob |
| `model_trigger_policies` | `automation.retrain.*` resource scope | Existing API + adapter | Redirect PUT to overrides |
| `model_closed_loop_policies` | `monitoring.*`, `automation.*` resource scope | Existing API + adapter | Redirect PUT to overrides |
| `model_slo_rules` | `monitoring.slo.rules` (json) resource scope | Existing API | Normalize to entries |

### 10.1 Adapter read order (during transition)

For key `monitoring.drift.threshold` on model `m-1`:

```text
1. cp_configuration_entries (resource → env → project → global)
2. Legacy adapter: model_closed_loop_policies.drift_psi_threshold
3. Key registry default
```

New writes go to **`cp_configuration_entries` only**. Legacy tables updated by **compat shim** until deprecation flag.

### 10.2 Feature flags vs configuration

| Setting | Layer | Default (fresh install) |
|---------|-------|-------------------------|
| `experiments_enabled` | Feature flag (L4) | `false` |
| `monitoring.drift.enabled` (capability) | Feature flag | `true` (capability available) |
| `monitoring.drift.enabled` (per model) | Configuration | `false` |
| `automation.retrain.enabled` | Configuration | `false` |
| `multi_cluster` | Feature flag | `false` |

Capability flags gate **code paths**; configuration gates **behavior** within an enabled capability.

---

## 11. Policy engine handoff (P1 — out of P0 scope)

Policy engine will:

1. Receive `ResolutionContext` + telemetry snapshot.
2. Call `resolver.resolve_prefix("monitoring.")` etc.
3. Evaluate `cp_policy_rules` / rule AST.
4. Emit actions (`DriftDetected`, `RetrainingRequested`) — not config mutations.

```text
ConfigurationResolver  →  values + provenance
PolicyEngine           →  actions + reasons
LifecycleFSM           →  allowed / blocked transitions
RBAC                   →  who may execute
```

P0 MUST NOT implement policy evaluation inside the resolver.

---

## 12. Lifecycle FSM handoff

Lifecycle transitions remain in `promotion_policy.py` / `model_version_aggregate.py` until formalized.

Configuration may **parameterize** guards (e.g. `governance.evaluation.require_before_promote`) but FSM **owns** transition validity.

---

## 13. AI agent extension points (disabled)

Interfaces reserved; no implementation:

| Interface | Role |
|-----------|------|
| `IAIOperationsProvider` | Read-only recommendations |
| `IMLAirToolProvider` | Tool catalog for future agent |
| `IIncidentAnalyzer` | Incident → suggested actions |

Agent output routes through Policy → RBAC → Audit. Never writes configuration directly.

Existing stub: `agent_integration_service.get_lifecycle_recommendations()`.

---

## 14. P0 implementation checklist

| # | Deliverable | Acceptance |
|---|-------------|------------|
| 1 | Migration `0060_configuration_entries` + optional log table | Unique scope+key; indexes for chain fetch |
| 2 | `key_registry.py` | ≥10 keys for drift/retrain/approval |
| 3 | `ConfigurationRepository` | `fetch_chain`, `upsert`, `delete_override`, `history` |
| 4 | `l4_configuration_adapter.py` | Read-only global mapping |
| 5 | `ConfigurationResolver` | Unit tests: inheritance, reset, disable, type validation |
| 6 | `EffectiveConfigurationService` | Audit + event on write |
| 7 | HTTP routes | GET effective, PUT overrides, DELETE reset, GET history |
| 8 | Legacy read adapters | closed_loop + trigger policy shim |
| 9 | Tests | Scenario 4 (global → project → model chain) |
| 10 | Hub UI | `EffectiveConfigPanel` on model detail (read-only P0) |

**Explicitly out of P0:** Policy engine, environment RBAC, full Settings MLOps tree, write UI for all scopes.

---

## 15. Default configuration (fresh install)

Aligned with product spec §11. Stored as **global** registry defaults + L4 feature flags.

| Key | Default | Scope |
|-----|---------|-------|
| `mlops.experiment.enabled` | `false` | global (UI flag) |
| `monitoring.drift.enabled` | `false` | resource |
| `monitoring.drift.threshold` | `0.20` | global |
| `monitoring.drift.method` | `"psi"` | global |
| `automation.retrain.enabled` | `false` | resource |
| `automation.deploy.enabled` | `false` | resource |
| `automation.rollback.enabled` | `false` | resource |
| `governance.approval.two_step_required` | `true` | project |
| `governance.evaluation.require_before_promote` | `true` | project |

---

## 16. Intentionally deferred

- Policy rule editor UI and `PolicyEngine` implementation
- Environment-aware RBAC matrix
- Full Hub nav restructure (Deployments, Environments, Policies hub)
- AI agent / autonomous actions
- Replacing MLflow experiment tracking
- Writing L4 system_settings from configuration override API
- Distributed configuration replication

---

## 17. Document governance

- Changes to resolution semantics require updating this file and bumping `control-plane-config-v1`.
- P0 PRs MUST link to the section they implement.
- Hub UI labels for provenance MUST match §6.4 table.

**Next step:** Extend policy rule editor UI and full Settings MLOps tree (see §16 deferred).
