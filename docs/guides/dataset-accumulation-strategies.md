# Dataset accumulation strategies

MLAir **`dataset_accumulation_buffers.accumulation_strategy`** controls how mutable runtime data becomes **immutable `dataset_versions`**. Values are enforced in API + Hub (`PATCH .../buffer`); invalid values fall back to **`snapshot_on_threshold`**.

| Strategy | Behavior | Typical materialization |
| --- | --- | --- |
| **`snapshot_on_threshold`** | Buffer grows until **`current_size` ≥ `target_threshold`**; then a new version is created and buffer advanced (runtime feedback path). | Automatic at threshold (see lineage materialization). |
| **`rolling_accumulate`** | Buffer grows; **no** automatic version on size alone; operators materialize manually or change strategy. | Manual / policy change. Hub shows an amber warning. |
| **`snapshot_on_schedule`** | Scheduler tick (`POST .../datasets/buffer/materialize-scheduled`) materializes non-empty buffers on each tick. If `current_size` &lt; `target_threshold`, the version is still created and marked **`force_time_only`** (time-driven snapshot). Metric: `mlair_dataset_materialization_schedule_time_only_total`. | Tick-driven (threshold optional). |
| **`manual_materialize_only`** | No auto snapshot from size; maintainer calls **`POST .../datasets/{id}/materialize`** (alias: **`.../buffer/materialize`**). | Operator button only. |

**Concurrency:** materialization uses advisory locks and idempotency keys (`lineage_service._materialize_runtime_feedback_if_needed`); see integration test **`test_materialization_concurrency_db`** when **`ML_AIR_RUN_DB_INTEGRATION_TESTS=1`**.

**Transactions:** automatic threshold materialization wraps buffer `SELECT … FOR UPDATE`, **`INSERT` into `dataset_versions`**, and buffer reset in one **`Connection.transaction()`** block (`psycopg` on `autocommit=True` connections). A failure after the insert attempt rolls back the whole unit so the buffer is not reset without a committed version row (and vice versa).

**Decision vs effect:** pre-insert gating (strategy / threshold / empty buffer) lives in **`_materialization_gate_failure_reason`**; the transactional block applies the **effect** (idempotent read, insert, buffer reset).

**Ingest vs materialize (task lineage):** **`ingest_lineage_from_task`** first calls **`_ingest_lineage_dataset_and_buffer`** (dataset row + buffer only), then **`_materialize_runtime_feedback_lineage_item_if_applicable`** when the item is **`runtime_feedback`** with no explicit **`version`** (same synchronous behavior as before; split is structural clarity and reuse). [`readiness-and-gating.md`](../api/readiness-and-gating.md) (source types), Dataset Hub **Accumulation** tab, [`manage-datasets-and-train-from-model.md`](./manage-datasets-and-train-from-model.md).
