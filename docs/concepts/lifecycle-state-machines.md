# Lifecycle state machines (MVP)

Coarse state machines matching shipped behavior. Use with [lifecycle-formal-model](./lifecycle-formal-model.md).

## Dataset version (quality / readiness surface)

```mermaid
stateDiagram-v2
  [*] --> Created: upload / materialize
  Created --> Ready: business_validation pass
  Created --> Degraded: quality warnings
  Ready --> Evaluated: POST readiness/evaluate
  Degraded --> Evaluated: POST readiness/evaluate
  Evaluated --> Ready: ready=true
  Evaluated --> Blocked: ready=false
```

Immutable fields after `Created` — see [dataset-version-immutability](../api/dataset-version-immutability.md).

## Run (execution)

```mermaid
stateDiagram-v2
  [*] --> PENDING: create_run
  PENDING --> RUNNING: scheduler schedules tasks
  RUNNING --> SUCCESS: all tasks success
  RUNNING --> FAILED: task failed / cancelled
  SUCCESS --> [*]
  FAILED --> [*]
```

Realtime: `run.created`, `run.updated`, `task.updated`, `training.completed` (on SUCCESS with pinned version).

## Model version (governance)

```mermaid
stateDiagram-v2
  [*] --> staging: register / import
  staging --> production: promote (policy + approval)
  production --> archived: promote or rollback policy
  staging --> archived: rollback / archive
  note right of production
    approval_status: pending | approved | rejected
  end note
```

Promote transitions constrained by [`promotion_policy.py`](../../api/app/domains/governance/promotion_policy.py).

## Buffer → materialization

```mermaid
stateDiagram-v2
  [*] --> Active: ingest / csv_import
  Active --> ThresholdMet: size >= target
  ThresholdMet --> Materialized: materialize tick
  Materialized --> Active: buffer reset new window
```

Event: `buffer.threshold_met`, `dataset.version.created`.
