# ML-AIR Disaster Recovery Checklist

## Severity Trigger

- Control plane unavailable > 10 minutes
- Data corruption detected in metadata/artifacts
- Region/cluster outage

## DR Activation Checklist

- [ ] Declare incident commander and communication channel
- [ ] Freeze non-essential deployments
- [ ] Confirm affected scope (API/scheduler/executor/db/object store)
- [ ] Confirm last healthy backup timestamps
- [ ] Start recovery timer and incident log

## Recovery Sequence

- [ ] Restore PostgreSQL from latest valid backup
- [ ] Restore MinIO artifact objects/version pointers
- [ ] Restore Redis (if required by recovery strategy)
- [ ] Bring up API, scheduler, executor
- [ ] Re-enable frontend and ingress
- [ ] Run smoke checks (`health`, trigger run, logs, DLQ replay)

## Data Integrity Verification

- [ ] Count of runs/tasks is within expected range
- [ ] Last known successful run is readable
- [ ] New run can complete end-to-end
- [ ] Alerting and dashboards are green

## Exit Criteria

- [ ] SLO health stabilized for 30 minutes
- [ ] Incident timeline documented
- [ ] Postmortem owner assigned
- [ ] Corrective actions added to backlog
