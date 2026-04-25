# ML-AIR SLO/SLA and Incident Runbook

## Service Objectives (Baseline v1)

### Availability SLO

- API availability >= 99.5% per 30-day window
- Scheduler/executor processing availability >= 99.0%

### Latency SLO

- `POST /runs` p95 < 1.0s
- `GET /runs/{id}` p95 < 500ms

### Reliability SLO

- Successful task completion ratio >= 98% (excluding intentional fail pipelines)
- DLQ replay success ratio >= 95%

## Internal SLA (Initial)

- P1 (production down): acknowledge within 10 minutes, mitigate within 60 minutes
- P2 (degraded service): acknowledge within 30 minutes, mitigate within 4 hours
- P3 (non-critical): resolve in next planned release

## Alert-to-Incident Flow

1. Alert fired in Prometheus/Grafana.
2. On-call validates signal (false positive vs real impact).
3. Create incident channel/ticket and assign commander.
4. Apply mitigation (rollback, scale worker, replay DLQ, restore data).
5. Confirm recovery with smoke + SLO metrics.
6. Publish summary and postmortem actions.

## Drill Automation

- Run a local incident drill:

```bash
make incident-drill
```

- This drill triggers an `always_fail_pipeline`, verifies failed run + DLQ replay path, then checks alert visibility in Prometheus (`MlAirTaskFailuresDetected`).

## Triage Playbook

### Scheduler requeue spike

- Check `mlair_scheduler_run_requeued_total`
- Verify queue pressure and `max_parallel_tasks`
- Scale executor replicas or lower incoming trigger rate

### Task failure spike

- Check `mlair_scheduler_task_completed_total{status="FAILED"}`
- Inspect run/task logs by `run_id` and `trace_id`
- Replay DLQ after root-cause fix

### Inflight stuck

- Check `mlair_executor_queue_inflight`
- Inspect executor logs and resource pressure
- Restart executor pods/containers if no progress

### Manifest security failures

- Check:
  - `increase(mlair_scheduler_manifest_verify_failure_total[10m])`
  - `increase(mlair_executor_manifest_post_total{result=~"sign_failed|post_failed"}[10m])`
- Follow detailed runbook:
  - `docs/operations-manifest-security-runbook.md`

## Postmortem Minimum Template

- Incident ID, timeline, impact, root cause
- Mitigation steps and restore timestamp
- Preventive actions with owner and due date
