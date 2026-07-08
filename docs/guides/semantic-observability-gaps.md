# Semantic observability — documented gaps

Lifecycle realtime events that are **not** mapped to a `SEMANTIC_OBSERVABILITY_SURFACES` metric bundle. Each is listed here so coverage checks pass without inventing placeholder metrics.

| Event type | Rationale |
|------------|-----------|
| `run.created` | Covered indirectly via run/task UIs; no dedicated counter in Phase 4 |
| `run.updated` | High-volume status fan-out; use run detail + Trace explorer |
| `run.tracking.updated` | Tracking params/metrics; use run tracking API |
| `task.updated` | Task scheduler events; use Tasks tab + execution graph |
| `dataset.updated` | Dataset metadata edits; use Dataset Hub |
| `training.eligibility.updated` | Dual-published as `eligibility.updated` (surface: `eligibility_eval`) |
| `training.policy.updated` | Policy CRUD; use Dataset Hub training policy panel |

Mapped surfaces: `GET /v1/runtime-config` → `observability.semantic_observability_surfaces`.

Index version: `GET /health` → `semantic_observability_index_version`.

Check script: `python scripts/check_semantic_observability_coverage.py`
