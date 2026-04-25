# ML-AIR v0.3.0 Release Notes

## What

- Ship Product Phase 3 core: lineage graph + dataset run history, immutable pipeline versions + config diff, run timeline + partial replay.
- Harden replay/manifest security: signed manifests (`hmac-sha256` + `ed25519`), `key_id` rotation, managed key provider (`env|file`), strict key lifecycle/allowlist, CI rotation guard, runbook + observability alerts/panels.
- Add task resource telemetry baseline: per-task `duration_ms`, `cpu_time_seconds`, `memory_rss_kb` stored in API and shown in run timeline UI.

## Why

- Improve debuggability and reproducibility with first-class lineage and version-aware execution.
- Reduce replay security risk by enforcing stronger manifest verification and key-management policy.
- Expose per-task runtime footprint to support incident triage and cost tuning in upcoming milestones.

## Risk

- Migration required (`0007_task_resource_usage`) for new task telemetry columns.
- Resource telemetry depends on runtime/process behavior; values are baseline signals (not container-level billing-grade metering).
- Strict manifest lifecycle settings can reject replay/sign operations when active/allowed keys are misconfigured.

## Env Changes

- Existing manifest hardening envs remain required for secured setups:
  - `ML_AIR_MANIFEST_KEY_PROVIDER`
  - `ML_AIR_MANIFEST_MANAGED_KEYS_FILE`
  - `ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE`
  - `ML_AIR_MANIFEST_ALLOWED_KEY_IDS`
- No new env var is required for task resource telemetry in v0.3.0 baseline.
