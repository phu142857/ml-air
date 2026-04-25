# Replay Guide (Run/Task)

Goal: replay quickly when a task fails, and understand when replay is blocked by policy.

## 1) Create a failed run for replay testing

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"replay-demo-001"}'
```

Get `run_id` and identify the failed `task_id`:

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
```

## 2) Replay from that task

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/replay" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>","idempotency_key":"replay-demo-001-retry"}'
```

## 3) Monitor the replay run

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<replay_run_id>"

curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<replay_run_id>/tasks"
```

## 4) Replay from UI

- Open run detail page.
- Select the failed task on timeline.
- Use replay / partial replay action.
- Verify new run is linked by `replay_of_run_id`.

## 5) When replay is blocked

These policy gates may block upstream skip during replay:

- `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE=1`
- `ML_AIR_REPLAY_REQUIRE_CHECKSUM=1`
- `ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST=1`

Check scheduler metric:

- `mlair_scheduler_manifest_verify_failure_total{reason=...}`

## Common Errors

- `replay_parent_not_found` / `run_not_found`: parent run does not exist in current scope.
- Invalid replay task id: `from_task_id` does not belong to parent run DAG.
- `replay_gating_blocked_*`: missing required evidence/artifact/checksum/valid manifest.
- Replay run is created but still fails: underlying business/plugin issue is still unresolved.

## Sample log

```text
replay gating failed for run <replay_run_id> from parent <parent_run_id>
```
