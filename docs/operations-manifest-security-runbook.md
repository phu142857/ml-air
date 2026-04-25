# ML-AIR Manifest Security Incident Runbook

Use this playbook when manifest-related alerts fire:

- `MlAirManifestVerifyFailures`
- `MlAirManifestPostFailures`

## Fast Triage Checklist (5-10 minutes)

1. Confirm scope:
   - Prometheus query:
     - `increase(mlair_scheduler_manifest_verify_failure_total[10m])`
     - `increase(mlair_executor_manifest_post_total{result=~"sign_failed|post_failed"}[10m])`
2. Identify dominant reason/result labels.
3. Check recent config/env changes (`.env`, compose, deploy vars).
4. Validate whether impact is replay-only or all task execution paths.

## Reason-Based Actions

### `missing_parent_success`

- Meaning: replay asked to skip upstream task, but parent task did not finish `SUCCESS`.
- Actions:
  - Verify parent run status and task states.
  - Re-run from an earlier task (or full run) instead of partial skip.
  - Do not disable gating globally unless emergency.

### `missing_parent_artifact_evidence`

- Meaning: parent task succeeded but no artifact/lineage evidence was found.
- Actions:
  - Check lineage ingestion and tracking artifact writes for parent run.
  - Verify plugin returned expected `artifacts` and/or `lineage`.
  - For urgent restore, set `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE=0` temporarily, then revert.

### `missing_parent_checksum_evidence`

- Meaning: checksum-required mode enabled and parent lineage outputs lacked checksums.
- Actions:
  - Ensure plugin emits checksum in lineage outputs.
  - If temporarily needed, set `ML_AIR_REPLAY_REQUIRE_CHECKSUM=0`, document incident, and restore to `1` after fix.

### `missing_or_invalid_signed_manifest`

- Meaning: signature verification failed or manifest is absent/invalid for replay skip.
- Actions:
  - Verify `ML_AIR_MANIFEST_SIGNING_ALGORITHM` alignment between executor and scheduler.
  - Verify `ML_AIR_MANIFEST_ACTIVE_KEY_ID`.
  - Verify key material:
    - HMAC: `ML_AIR_MANIFEST_SIGNING_KEYS_JSON` / fallback key.
    - Ed25519: private keys on executor, public keys on scheduler.
  - Rotate key only via controlled procedure (active + grace window), never ad-hoc overwrite.

## Post/Sign Failures (`mlair_executor_manifest_post_total`)

### `sign_failed`

- Meaning: executor could not sign manifest payload.
- Actions:
  - Check algorithm/key env presence and PEM formatting.
  - For Ed25519, ensure private key matches active `kid`.
  - Validate key parse support (`\\n` escaped PEM format accepted).

### `post_failed`

- Meaning: executor failed posting manifest to API endpoint.
- Actions:
  - Check API health/network from executor container.
  - Verify token (`ML_AIR_TRACKING_TOKEN`) still valid.
  - Inspect API logs around `/tasks/{task_id}/manifest`.

## Safe Emergency Mitigation Order

1. Keep `ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST=1` whenever possible.
2. If service must recover quickly:
   - Temporarily relax checksum first (`ML_AIR_REPLAY_REQUIRE_CHECKSUM=0`),
   - then artifact evidence only if necessary (`ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE=0`),
   - avoid disabling signed-manifest requirement unless P1.
3. Record exact start/end times and restore secure settings immediately after mitigation.

## Recovery Validation

- `make test-smoke-v03`
- `make test-observability`
- Confirm all manifest-related alert expressions return to baseline.

## Postmortem Required Fields

- Root cause class (`config drift`, `key mismatch`, `plugin output schema drift`, `network/API`)
- Blast radius (runs/projects/tenants affected)
- Temporary relaxations applied (which envs changed, when reverted)
- Permanent fix and owner
